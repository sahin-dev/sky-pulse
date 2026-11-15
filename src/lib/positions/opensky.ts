import "server-only";
import { cacheLife } from "next/cache";
import type { AircraftState, BBox, TrackPoint } from "../types";

/**
 * OpenSky Network REST API — https://openskynetwork.github.io/opensky-api/rest.html
 * Free for non-commercial use. Anonymous access is rate-limited by daily credits;
 * a (free) registered API client gets more. Set OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET.
 */
const API = "https://opensky-network.org/api";
const TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const UA = { "User-Agent": "SkyPulse flight tracker" };

let token: { value: string; expires: number } | null = null;

async function authHeaders(): Promise<Record<string, string>> {
  const id = process.env.OPENSKY_CLIENT_ID;
  const secret = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return UA;
  if (!token || Date.now() > token.expires - 30_000) {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
    });
    if (!res.ok) throw new Error(`OpenSky login failed (HTTP ${res.status}). Check OPENSKY_CLIENT_ID / SECRET.`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  }
  return { ...UA, Authorization: `Bearer ${token.value}` };
}

/* OpenSky state vector: positional array, see API docs. */
type StateVector = [
  string, string | null, string, number | null, number, number | null, number | null,
  number | null, boolean, number | null, number | null, number | null, unknown, number | null,
  string | null, boolean, number,
];

function toState(s: StateVector): AircraftState | null {
  const [hex, callsign, country, timePos, lastContact, lon, lat, baroAlt, onGround, velocity, track, vrate, , geoAlt, squawk] = s;
  if (lat == null || lon == null) return null;
  return {
    hex: hex.toLowerCase(),
    callsign: callsign?.trim() || null,
    lat,
    lon,
    altitude: baroAlt ?? geoAlt ?? null,
    onGround,
    speed: velocity != null ? velocity * 3.6 : null,
    track,
    verticalRate: vrate != null ? vrate * 3.6 : null,
    squawk: squawk || null,
    registration: null,
    type: null,
    originCountry: country || null,
    updated: (timePos ?? lastContact) * 1000,
    provider: "OpenSky",
  };
}

export type OpenSkyResult =
  | { ok: true; states: AircraftState[]; creditsRemaining: number | null }
  | { ok: false; message: string; creditsRemaining: number | null };

async function getJson(url: string): Promise<{ status: number; json: unknown; remaining: number | null }> {
  const res = await fetch(url, { headers: await authHeaders() });
  const remaining = Number(res.headers.get("x-rate-limit-remaining"));
  const json = res.ok ? await res.json() : null;
  return { status: res.status, json, remaining: Number.isFinite(remaining) ? remaining : null };
}

function failure(status: number, remaining: number | null): OpenSkyResult {
  const message =
    status === 429
      ? "OpenSky's daily request credits are used up — showing fewer live positions."
      : `OpenSky responded with HTTP ${status}.`;
  return { ok: false, message, creditsRemaining: remaining };
}

/**
 * All aircraft in a box (snapped to a 5° grid so nearby pans share a cache entry),
 * or the whole world when `box` is null. Bigger areas cost more OpenSky credits,
 * so the world view is cached longer.
 */
export async function openskyStates(box: BBox | null): Promise<OpenSkyResult> {
  "use cache";
  let url = `${API}/states/all`;
  if (box) url += `?lamin=${box.s}&lomin=${box.w}&lamax=${box.n}&lomax=${box.e}`;

  let result: OpenSkyResult;
  try {
    const { status, json, remaining } = await getJson(url);
    if (status !== 200) result = failure(status, remaining);
    else {
      const states = ((json as { states: StateVector[] | null }).states ?? [])
        .map(toState)
        .filter((s): s is AircraftState => !!s);
      result = { ok: true, states, creditsRemaining: remaining };
    }
  } catch (e) {
    result = { ok: false, message: e instanceof Error ? e.message : "Couldn't reach OpenSky.", creditsRemaining: null };
  }

  if (!result.ok) cacheLife({ stale: 30, revalidate: 30, expire: 60 });
  else if (!box) cacheLife({ stale: 60, revalidate: 300, expire: 900 });
  else cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  return result;
}

/** One aircraft by ICAO 24-bit address. */
export async function openskyAircraft(hex: string): Promise<AircraftState | null> {
  "use cache";
  cacheLife({ stale: 10, revalidate: 15, expire: 120 });
  try {
    const { status, json } = await getJson(`${API}/states/all?icao24=${encodeURIComponent(hex.toLowerCase())}`);
    if (status !== 200) return null;
    const s = (json as { states: StateVector[] | null }).states?.[0];
    return s ? toState(s) : null;
  } catch {
    return null;
  }
}

/** The aircraft's current (or most recent) flown track. */
export async function openskyTrack(hex: string): Promise<TrackPoint[] | null> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  try {
    const { status, json } = await getJson(`${API}/tracks/all?icao24=${encodeURIComponent(hex.toLowerCase())}&time=0`);
    if (status !== 200 || !json) return null;
    // path entries: [time s, lat, lon, baro altitude m, true track, on ground]
    const path = (json as { path: [number, number | null, number | null, number | null, number, boolean][] }).path ?? [];
    return path
      .filter((p) => p[1] != null && p[2] != null)
      .map((p) => [p[1]!, p[2]!, p[3], p[0] * 1000] as TrackPoint);
  } catch {
    return null;
  }
}
