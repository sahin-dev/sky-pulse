import "server-only";
import { airlineFromCallsign } from "../airports";
import { describeAircraft } from "../reference/aircraft";
import { distanceKm } from "../geo";
import type { AircraftState, BBox, Flight, LiveData, PositionsMeta, TrackPoint, Traffic } from "../types";
import { ADSBLOL_MAX_RADIUS_NM, adsblolByCallsign, adsblolByHex, adsblolPoint } from "./adsblol";
import { openskyAircraft, openskyStates, openskyTrack } from "./opensky";

/**
 * Live aircraft positions from ADS-B networks, used to correct / complete
 * aviationstack (whose `live` block is missing for most flights).
 *
 * POSITIONS_PROVIDER = auto (default) | opensky | adsblol | off
 *   auto: zoomed-in views use adsb.lol (point + radius ≤ 250 NM, no key, fresher);
 *         wider views use OpenSky (bounding box / whole world). Each falls back to the other.
 */
type Provider = "auto" | "opensky" | "adsblol" | "off";
const PROVIDER = (["auto", "opensky", "adsblol", "off"].includes(process.env.POSITIONS_PROVIDER ?? "")
  ? process.env.POSITIONS_PROVIDER
  : "auto") as Provider;

export const positionsEnabled = () => PROVIDER !== "off";

const NM_KM = 1.852;

/** Snap a box outward to a 5° grid so similar viewports share one cached OpenSky request. */
function snapBox(b: BBox): BBox | null {
  if (b.e - b.w >= 180 || b.n - b.s >= 120) return null; // ≈ world view → one global request
  const down = (v: number) => Math.floor(v / 5) * 5;
  const up = (v: number) => Math.ceil(v / 5) * 5;
  // OpenSky expects longitudes in [-180, 180]; wrap the box centre into range.
  const shift = Math.round(((b.w + b.e) / 2) / 360) * 360;
  return {
    s: Math.max(-90, down(b.s)),
    n: Math.min(90, up(b.n)),
    w: Math.max(-180, down(b.w - shift)),
    e: Math.min(180, up(b.e - shift)),
  };
}

/** Smallest circle (centre + radius in NM) around the box, if adsb.lol can cover it. */
function circleFor(b: BBox): { lat: number; lon: number; radiusNm: number } | null {
  const lat = (b.s + b.n) / 2;
  const lon = (((((b.w + b.e) / 2 + 180) % 360) + 360) % 360) - 180;
  const corner = Math.max(distanceKm([lat, lon], [b.n, lon + (b.e - b.w) / 2]), distanceKm([lat, lon], [b.s, lon + (b.e - b.w) / 2]));
  const radiusNm = corner / NM_KM;
  return radiusNm <= ADSBLOL_MAX_RADIUS_NM ? { lat, lon, radiusNm } : null;
}

export async function aircraftInBox(box: BBox): Promise<{ states: AircraftState[]; meta: PositionsMeta }> {
  const meta: PositionsMeta = { provider: null, count: 0, warning: null, creditsRemaining: null };
  if (PROVIDER === "off") return { states: [], meta };

  const circle = circleFor(box);
  const tryAdsbLol = async () => {
    // Too wide for one adsb.lol query: cover the middle of the view only.
    const c = circle ?? { lat: (box.s + box.n) / 2, lon: (box.w + box.e) / 2, radiusNm: ADSBLOL_MAX_RADIUS_NM };
    const r = await adsblolPoint(c.lat, c.lon, c.radiusNm);
    if (r.ok) {
      meta.provider = "adsb.lol";
      if (!circle) meta.warning = (meta.warning ? meta.warning + " " : "") + "Live positions cover the centre of the view only.";
      return r.states;
    }
    meta.warning = r.message;
    return null;
  };
  const tryOpenSky = async () => {
    const r = await openskyStates(snapBox(box));
    meta.creditsRemaining = r.creditsRemaining;
    if (r.ok) {
      meta.provider = "OpenSky";
      return r.states;
    }
    meta.warning = r.message;
    return null;
  };

  const order =
    PROVIDER === "opensky" ? [tryOpenSky] :
    PROVIDER === "adsblol" ? [tryAdsbLol] :
    circle ? [tryAdsbLol, tryOpenSky] : [tryOpenSky, tryAdsbLol];

  let states: AircraftState[] = [];
  for (const attempt of order) {
    const got = await attempt();
    if (got) {
      states = got;
      break;
    }
  }
  meta.count = states.length;
  return { states, meta };
}

/** Live state of one aircraft — by ICAO address first, then by callsign. */
export async function aircraftFor(hex: string | null, callsign: string | null): Promise<AircraftState | null> {
  if (PROVIDER === "off") return null;
  const useLol = PROVIDER !== "opensky";
  const useSky = PROVIDER !== "adsblol";
  if (hex) {
    const s = (useLol && (await adsblolByHex(hex))) || (useSky && (await openskyAircraft(hex))) || null;
    if (s) return s;
  }
  if (callsign && useLol) return adsblolByCallsign(callsign);
  return null;
}

/** Actual flown track (OpenSky). */
export async function trackFor(hex: string | null): Promise<TrackPoint[] | null> {
  if (!hex || PROVIDER === "off" || PROVIDER === "adsblol") return null;
  return openskyTrack(hex);
}

/* ------------------------------- fusion -------------------------------- */

export function stateToLive(s: AircraftState): LiveData {
  return {
    source: "adsb",
    provider: s.provider,
    updated: s.updated,
    lat: s.lat,
    lon: s.lon,
    altitude: s.altitude ?? 0,
    heading: s.track ?? 0,
    speed: s.speed ?? 0,
    verticalSpeed: s.verticalRate ?? 0,
    isGround: s.onGround,
  };
}

/** Prefer the fresher of two positions. */
function fresher(a: LiveData | null, b: LiveData): LiveData {
  return !a || b.updated >= a.updated ? b : a;
}

/** Put an ADS-B state onto a flight (position + any aircraft details aviationstack lacked). */
export function applyState(f: Flight, s: AircraftState): Flight {
  return {
    ...f,
    live: fresher(f.live, stateToLive(s)),
    aircraft: describeAircraft({
      hex: f.aircraft?.icao24 ?? s.hex,
      registration: f.aircraft?.registration ?? s.registration,
      type: f.aircraft?.type ?? s.type,
    }),
  };
}

const normCs = (c: string | null | undefined) => (c ?? "").replace(/\s+/g, "").toUpperCase();

/**
 * Match ADS-B aircraft to scheduled flights by ICAO address (reliable) or by
 * operating callsign. Unmatched aircraft become "traffic".
 */
export function fuse(flights: Flight[], states: AircraftState[]): { flights: Flight[]; traffic: Traffic[] } {
  const byHex = new Map(states.map((s) => [s.hex, s]));
  const byCs = new Map(states.filter((s) => s.callsign).map((s) => [normCs(s.callsign), s]));
  const used = new Set<string>();

  const merged = flights.map((f) => {
    // Only flights that should be airborne (or about to be) can own an aircraft right now.
    if (f.status !== "active") return f;
    const hex = f.aircraft?.icao24?.toLowerCase();
    const s = (hex && byHex.get(hex)) || (f.callsign && byCs.get(normCs(f.callsign))) || null;
    if (!s || used.has(s.hex)) return f;
    used.add(s.hex);
    return applyState(f, s);
  });

  const traffic: Traffic[] = states
    .filter((s) => !used.has(s.hex))
    .map((s) => {
      const airline = airlineFromCallsign(s.callsign);
      const m = /^[A-Z]{3}(\d{1,4})$/.exec(normCs(s.callsign));
      const info = describeAircraft({ hex: s.hex, registration: s.registration, type: s.type });
      return {
        ...s,
        registration: info.registration,
        type: info.type,
        typeName: info.typeName,
        operator: info.operator,
        yearBuilt: info.yearBuilt,
        airline,
        flightGuess: airline?.iata && m ? `${airline.iata}${Number(m[1])}` : null,
      };
    });

  return { flights: merged, traffic };
}
