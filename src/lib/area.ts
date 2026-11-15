import "server-only";
import { airportByIata, largeAirports } from "./airports";
import { getActiveDepartures, getActiveSnapshot, isDemoMode, isUnavailableError, mergeFlights } from "./aviationstack";
import type { DataMode } from "./types";
import { aircraftPosition } from "./geo";
import { HUB_RANKING } from "./hubs";
import { aircraftInBox, fuse } from "./positions";
import type { AreaResult, BBox, Flight, Traffic } from "./types";

const envInt = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Busiest airports in view whose departures are fetched per area (each = 1 request, cached 10 min). 0 disables. */
const REGION_AIRPORTS = envInt(process.env.AVIATIONSTACK_REGION_AIRPORTS, 2, 0, 10);
/** Regional fetches only kick in once the view is narrower than this many degrees of longitude. */
const REGION_MAX_SPAN = 90;
/** Upper bounds on markers sent to the browser. */
const MAX_RESULTS = 400;
const MAX_TRAFFIC = 1500;
/** Below this view width (degrees) aircraft on the ground are shown too. */
const SHOW_GROUND_SPAN = 6;

/** Is (lat, lon) inside the box? Handles boxes that cross the antimeridian or span the whole world. */
export function inBox(b: BBox, lat: number, lon: number): boolean {
  if (lat < b.s || lat > b.n) return false;
  const span = b.e - b.w;
  if (span >= 360) return true;
  const x = (((lon - b.w) % 360) + 360) % 360;
  return x <= span;
}

/** The busiest airports inside the box: ranked hubs first, then other large airports (OurAirports). */
function hubsInBox(b: BBox, count: number): string[] {
  const out: string[] = [];
  for (const iata of HUB_RANKING) {
    if (out.length >= count) return out;
    const ap = airportByIata(iata);
    if (ap && inBox(b, ap.lat, ap.lon)) out.push(iata);
  }
  for (const ap of largeAirports((lat, lon) => inBox(b, lat, lon))) {
    if (out.length >= count) break;
    if (!out.includes(ap.iata)) out.push(ap.iata);
  }
  return out;
}

const hexHash = (hex: string) => Number.parseInt(hex.slice(-4), 16) || 0;

/** Keep at most `max` aircraft, spread evenly (stable across refreshes) rather than truncating a region. */
function thin(traffic: Traffic[], max: number): Traffic[] {
  if (traffic.length <= max) return traffic;
  const keepEvery = traffic.length / max;
  return [...traffic].sort((a, b) => hexHash(a.hex) - hexHash(b.hex)).filter((_, i) => i % keepEvery < 1).slice(0, max);
}

function inView(b: BBox, f: Flight, now: number): boolean {
  const ac = aircraftPosition(f, now);
  return !!ac && inBox(b, ac.pos[0], ac.pos[1]);
}

/**
 * Flights and aircraft currently inside a map viewport.
 *
 * aviationstack has no geographic filter, so scheduled flights come from:
 *  1. the cached global snapshot of airborne flights, filtered to the box, and
 *  2. when zoomed into a region, live departures from its busiest airports.
 * In parallel, ADS-B networks (adsb.lol / OpenSky) report every aircraft in the
 * box. Those are matched to scheduled flights (real positions replace estimates);
 * unmatched aircraft are returned as `traffic`.
 */
export async function getFlightsInArea(box: BBox, now: number): Promise<AreaResult> {
  const span = box.e - box.w;
  const regional = REGION_AIRPORTS > 0 && span <= REGION_MAX_SPAN ? hubsInBox(box, REGION_AIRPORTS) : [];

  const [snapshot, adsb, ...extra] = await Promise.allSettled([
    getActiveSnapshot(now),
    aircraftInBox(box),
    ...regional.map((iata) => getActiveDepartures(iata, now)),
  ]);

  // Quota used up / bad key: let the caller switch to the free sources instead of showing half a map.
  if (snapshot.status === "rejected" && isUnavailableError(snapshot.reason)) throw snapshot.reason;

  const warnings: string[] = [];
  const lists: Flight[][] = [];
  let mode: DataMode = isDemoMode() ? "demo" : "aviationstack";
  // Scheduled data and live positions are independent: either one failing still leaves a useful map.
  if (snapshot.status === "fulfilled") {
    lists.push(snapshot.value.flights);
    mode = snapshot.value.mode;
  } else {
    warnings.push(snapshot.reason instanceof Error ? snapshot.reason.message : "Couldn't load scheduled flights.");
  }
  const regionalOk: string[] = [];
  extra.forEach((r, i) => {
    if (r.status === "fulfilled") {
      lists.push(r.value.flights);
      regionalOk.push(regional[i]);
    } else {
      warnings.push(r.reason instanceof Error ? r.reason.message : "Couldn't load regional flights.");
    }
  });

  const positions =
    adsb.status === "fulfilled"
      ? adsb.value
      : { states: [], meta: { provider: null, count: 0, warning: "Live positions unavailable.", creditsRemaining: null } };
  if (lists.length === 0 && positions.states.length === 0) {
    throw snapshot.status === "rejected" ? snapshot.reason : new Error("No flight data available.");
  }

  // Demo flights are simulated; never attach a real aircraft's position to them.
  const fused = mode === "demo"
    ? { flights: mergeFlights(lists), traffic: fuse([], positions.states).traffic }
    : fuse(mergeFlights(lists), positions.states);
  const flights = fused.flights.filter((f) => inView(box, f, now)).slice(0, MAX_RESULTS);
  const traffic = thin(
    fused.traffic.filter((t) => inBox(box, t.lat, t.lon) && (!t.onGround || span <= SHOW_GROUND_SPAN)),
    MAX_TRAFFIC,
  );

  return {
    flights,
    traffic,
    positions: positions.meta,
    mode,
    regional: regionalOk,
    warning: warnings[0] ?? null,
    now,
  };
}

export function parseBBox(sp: URLSearchParams): BBox | null {
  const [s, w, n, e] = ["s", "w", "n", "e"].map((k) => Number(sp.get(k)));
  if (![s, w, n, e].every(Number.isFinite)) return null;
  if (s < -90 || n > 90 || s >= n || w >= e) return null;
  return { s, w, n, e };
}
