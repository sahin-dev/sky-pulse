import "server-only";
import { cacheLife } from "next/cache";
import type { AircraftState } from "../types";

/**
 * adsb.lol — open, community-fed ADS-B data (ODbL). https://api.adsb.lol/docs
 * No key needed. Area queries are a point + radius (max 250 NM).
 */
const API = "https://api.adsb.lol/v2";
const UA = { "User-Agent": "SkyPulse flight tracker" };
export const ADSBLOL_MAX_RADIUS_NM = 250;

interface Ac {
  hex: string;
  flight?: string;
  r?: string;
  t?: string;
  alt_baro?: number | "ground";
  alt_geom?: number;
  gs?: number;
  track?: number;
  true_heading?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  lat?: number;
  lon?: number;
  seen_pos?: number;
  seen?: number;
}

function toState(a: Ac, now: number): AircraftState | null {
  if (a.lat == null || a.lon == null) return null;
  const ground = a.alt_baro === "ground";
  const altFt = typeof a.alt_baro === "number" ? a.alt_baro : (a.alt_geom ?? null);
  const rate = a.baro_rate ?? a.geom_rate;
  return {
    hex: a.hex.replace(/^~/, "").toLowerCase(),
    callsign: a.flight?.trim() || null,
    lat: a.lat,
    lon: a.lon,
    altitude: ground ? 0 : altFt != null ? altFt * 0.3048 : null,
    onGround: ground,
    speed: a.gs != null ? a.gs * 1.852 : null,
    track: a.track ?? a.true_heading ?? null,
    verticalRate: rate != null ? rate * 0.018288 : null, // ft/min → km/h
    squawk: a.squawk ?? null,
    registration: a.r ?? null,
    type: a.t ?? null,
    originCountry: null,
    updated: now - (a.seen_pos ?? a.seen ?? 0) * 1000,
    provider: "adsb.lol",
  };
}

async function query(path: string): Promise<AircraftState[]> {
  const res = await fetch(`${API}${path}`, { headers: UA });
  if (!res.ok) throw new Error(res.status === 429 ? "adsb.lol is rate-limiting requests." : `adsb.lol responded with HTTP ${res.status}.`);
  const json = (await res.json()) as { ac?: Ac[]; now?: number };
  const now = json.now ?? Date.now();
  return (json.ac ?? []).map((a) => toState(a, now)).filter((s): s is AircraftState => !!s);
}

export type AdsbLolResult = { ok: true; states: AircraftState[] } | { ok: false; message: string };

/** All aircraft within `radiusNm` of a point (rounded so nearby pans share a cache entry). */
export async function adsblolPoint(lat: number, lon: number, radiusNm: number): Promise<AdsbLolResult> {
  "use cache";
  let result: AdsbLolResult;
  try {
    const r = Math.min(ADSBLOL_MAX_RADIUS_NM, Math.ceil(radiusNm));
    result = { ok: true, states: await query(`/point/${lat.toFixed(1)}/${lon.toFixed(1)}/${r}`) };
  } catch (e) {
    result = { ok: false, message: e instanceof Error ? e.message : "Couldn't reach adsb.lol." };
  }
  if (result.ok) cacheLife({ stale: 10, revalidate: 15, expire: 120 });
  else cacheLife({ stale: 20, revalidate: 20, expire: 60 });
  return result;
}

/** One aircraft by ICAO 24-bit address. */
export async function adsblolByHex(hex: string): Promise<AircraftState | null> {
  "use cache";
  cacheLife({ stale: 5, revalidate: 10, expire: 60 });
  try {
    return (await query(`/icao/${encodeURIComponent(hex.toLowerCase())}`))[0] ?? null;
  } catch {
    return null;
  }
}

/** One aircraft by callsign (e.g. "BAW117"). */
export async function adsblolByCallsign(callsign: string): Promise<AircraftState | null> {
  "use cache";
  cacheLife({ stale: 5, revalidate: 10, expire: 60 });
  try {
    return (await query(`/callsign/${encodeURIComponent(callsign.toUpperCase())}`))[0] ?? null;
  } catch {
    return null;
  }
}
