import "server-only";
import { airlineByIcao, airlineFromCallsign, airlineIcaoCodes, type AirportRecord } from "../airports";
import { bearing, distanceKm, type LatLon } from "../geo";
import { aircraftFor, aircraftInBox, fuse, stateToLive, trackFor } from "../positions";
import { adsblolPoint } from "../positions/adsblol";
import { describeAircraft } from "../reference/aircraft";
import { toAirportWallClock } from "../time";
import type { AircraftState, AreaResult, BBox, Endpoint, Flight, FlightQuery, FlightResult, TimePoint, TrackPoint, Traffic } from "../types";
import { airportForCode, callsignsFor, routeCodes } from "./routes";

/**
 * Free data mode: flights built from ADS-B aircraft + the open callsign→route
 * database. No schedules, gates or official delays exist in free data, so:
 *  - departure time = observed takeoff (from the ADS-B track) when available
 *  - arrival time   = estimate from remaining distance and ground speed
 *  - status         = derived from position (airborne / on ground at origin / at destination)
 * Every flight built here has `inferred: true` so the UI can say so.
 */

const WORLD: BBox = { s: -90, w: -180, n: 90, e: 180 };
const AT_AIRPORT_KM = 8;
const MAX_FLIGHTS = 400;

/* ------------------------------- helpers ------------------------------- */

function timePoint(utc: number, tz: string): TimePoint {
  return { local: toAirportWallClock(utc, tz).slice(0, 16), utc };
}

function endpoint(ap: AirportRecord | null, times: { actual?: number | null; estimated?: number | null } = {}): Endpoint {
  const tz = ap?.timezone || "UTC";
  return {
    iata: ap?.iata ?? "—",
    icao: ap?.icao ?? "",
    name: ap?.name ?? "Unknown airport",
    city: ap?.city ?? "",
    country: ap?.country ?? "",
    lat: ap?.lat ?? null,
    lon: ap?.lon ?? null,
    timezone: tz,
    terminal: null,
    gate: null,
    baggage: null,
    delay: null,
    scheduled: null,
    estimated: times.estimated != null ? timePoint(times.estimated, tz) : null,
    actual: times.actual != null ? timePoint(times.actual, tz) : null,
  };
}

const pos = (ap: AirportRecord): LatLon => [ap.lat, ap.lon];

function angleDiff(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

interface Leg {
  dep: AirportRecord;
  arr: AirportRecord;
  status: Flight["status"];
}

/**
 * Pick the leg of a (possibly multi-stop) route the aircraft is on, and reject
 * routes that don't fit what ADS-B shows — callsigns get reused and the
 * database can be stale, so a position far off the route means "unknown".
 */
function pickLeg(codes: string[], s: AircraftState): Leg | null {
  const airports = codes.map(airportForCode);
  const p: LatLon = [s.lat, s.lon];

  if (s.onGround) {
    // On the ground: must be at one of the route's airports.
    for (let i = 0; i < airports.length; i++) {
      const ap = airports[i];
      if (!ap || distanceKm(p, pos(ap)) > AT_AIRPORT_KM) continue;
      if (i === airports.length - 1) {
        const prev = airports[i - 1];
        return prev ? { dep: prev, arr: ap, status: "landed" } : null;
      }
      const next = airports[i + 1];
      return next ? { dep: ap, arr: next, status: "scheduled" } : null;
    }
    return null;
  }

  let best: { leg: Leg; detour: number; total: number } | null = null;
  for (let i = 0; i < airports.length - 1; i++) {
    const a = airports[i];
    const b = airports[i + 1];
    if (!a || !b) continue;
    const total = distanceKm(pos(a), pos(b));
    const detour = distanceKm(pos(a), p) + distanceKm(p, pos(b)) - total;
    if (!best || detour < best.detour) best = { leg: { dep: a, arr: b, status: "active" }, detour, total };
  }
  if (!best) return null;
  // Real tracks deviate from the great circle (airways, weather, oceanic tracks), so allow some slack.
  if (best.detour > Math.max(300, best.total * 0.35)) return null;
  const remaining = distanceKm(p, pos(best.leg.arr));
  if (s.track != null && remaining > 80 && angleDiff(s.track, bearing(p, pos(best.leg.arr))) > 110) return null;
  return best.leg;
}

/**
 * Typical cruise ground speed for this leg (km/h). The aircraft's *current* speed is only
 * representative at cruise altitude — during climb or approach it's far lower (e.g. 350 km/h
 * on final), which would make time estimates hours off.
 */
function cruiseSpeed(s: AircraftState, legKm: number): number {
  const atCruise = (s.altitude ?? 0) > 7_000 && !!s.speed && s.speed > 500;
  if (atCruise) return Math.min(Math.max(s.speed!, 600), 1_000); // includes the real wind effect
  return legKm < 600 ? 480 : 820; // regional turboprop/short hop vs. jet
}

/** Estimated arrival: remaining distance at cruise speed, plus approach time. */
function estimateArrival(s: AircraftState, leg: { dep: AirportRecord; arr: AirportRecord }, now: number): number {
  const remaining = distanceKm([s.lat, s.lon], pos(leg.arr));
  const legKm = distanceKm(pos(leg.dep), pos(leg.arr));
  // Close in, the current speed *is* the approach speed; further out, assume cruise.
  const speed = remaining < 60 && s.speed && s.speed > 150 ? s.speed : cruiseSpeed(s, legKm);
  const approachMin = remaining > 150 ? 12 : remaining < 60 ? 2 : 6;
  return now + (remaining / speed) * 3_600_000 + approachMin * 60_000;
}

/**
 * Estimated takeoff when no track is at hand (e.g. search lists): distance already
 * flown from the origin divided by speed, with the first ~150 km (climb-out) slower.
 */
function estimateTakeoff(s: AircraftState, leg: { dep: AirportRecord; arr: AirportRecord }, now: number): number {
  const flown = distanceKm(pos(leg.dep), [s.lat, s.lon]);
  const cruise = cruiseSpeed(s, distanceKm(pos(leg.dep), pos(leg.arr)));
  const climbKm = Math.min(flown, 150);
  const hours = climbKm / (cruise * 0.6) + (flown - climbKm) / cruise;
  return now - hours * 3_600_000;
}

/** Takeoff time from an ADS-B track: first airborne point, if the track starts at the departure airport. */
export function takeoffTime(track: TrackPoint[] | null, dep: AirportRecord): number | null {
  if (!track?.length) return null;
  if (distanceKm([track[0][0], track[0][1]], pos(dep)) > 40) return null;
  const firstAirborne = track.find((t) => (t[2] ?? 0) > 150);
  return firstAirborne?.[3] ?? null;
}

function flightNumberFor(callsign: string) {
  const airline = airlineFromCallsign(callsign);
  const m = /^([A-Z]{3})(\d{1,4})([A-Z]{0,2})$/.exec(callsign);
  // Callsign BAW117 is usually flight BA117 — but not always (e.g. QTR31T), so keep the callsign when unsure.
  const iata = airline?.iata && m && !m[3] ? `${airline.iata}${Number(m[2])}` : callsign;
  return { airline, iata, number: m ? `${Number(m[2])}${m[3]}` : callsign };
}

function baseFlight(callsign: string, s: AircraftState | null, leg: Leg | null, now: number): Flight {
  const { airline, iata, number } = flightNumberFor(callsign);
  const prefix = callsign.slice(0, 3);
  return {
    key: `${callsign}-${s?.hex ?? "route"}`,
    date: new Date(now).toISOString().slice(0, 10),
    status: leg?.status ?? (s ? (s.onGround ? "unknown" : "active") : "unknown"),
    number,
    iata,
    icao: callsign,
    airline: airline
      ? { name: airline.name, iata: airline.iata, icao: airline.icao }
      : { name: airlineByIcao(prefix)?.name ?? s?.originCountry ?? "Unknown operator", iata: "", icao: prefix },
    codeshare: null,
    aircraft: s ? describeAircraft({ hex: s.hex, registration: s.registration, type: s.type }) : null,
    callsign,
    live: s ? stateToLive(s) : null,
    departure: endpoint(leg?.dep ?? null),
    arrival: endpoint(leg?.arr ?? null),
    inferred: true,
  };
}

/** A flight for an ADS-B aircraft whose callsign has a route that fits its position — otherwise null. */
export function flightFromState(s: AircraftState, now: number): Flight | null {
  if (!s.callsign) return null;
  const codes = routeCodes(s.callsign);
  if (!codes) return null;
  const leg = pickLeg(codes, s);
  if (!leg) return null;
  const f = baseFlight(s.callsign, s, leg, now);
  if (leg.status === "active") {
    f.departure = endpoint(leg.dep, { estimated: estimateTakeoff(s, leg, now) });
    f.arrival = endpoint(leg.arr, { estimated: estimateArrival(s, leg, now) });
  }
  return f;
}

/* ----------------------------- public API ----------------------------- */

/** Split ADS-B aircraft into routed flights (≤ MAX_FLIGHTS, spread evenly) and other traffic. */
function splitStates(states: AircraftState[], now: number, box: BBox) {
  const span = box.e - box.w;
  const visible = states.filter((s) => !s.onGround || span <= 6);
  const flights: Flight[] = [];
  const rest: AircraftState[] = [];
  for (const s of visible) {
    const f = flightFromState(s, now);
    if (f) flights.push(f);
    else rest.push(s);
  }
  // Too many plane icons for one view: keep an even sample as flights, the rest as dots.
  let shown = flights;
  if (flights.length > MAX_FLIGHTS) {
    const every = flights.length / MAX_FLIGHTS;
    shown = flights.filter((_, i) => i % every < 1);
    const keep = new Set(shown.map((f) => f.key));
    const byHex = new Map(visible.map((s) => [s.hex, s]));
    for (const f of flights) {
      const s = !keep.has(f.key) ? byHex.get(f.aircraft?.icao24?.toLowerCase() ?? "") : undefined;
      if (s) rest.push(s);
    }
  }
  return { flights: shown, traffic: fuse([], rest).traffic };
}

export async function freeArea(box: BBox, now: number): Promise<AreaResult> {
  const { states, meta } = await aircraftInBox(box);
  const { flights, traffic } = splitStates(states, now, box);
  return {
    flights,
    traffic: thinTraffic(traffic, 1500),
    positions: meta,
    mode: "free",
    regional: [],
    warning: states.length === 0 ? (meta.warning ?? "No live aircraft data available right now.") : null,
    now,
  };
}

function thinTraffic(traffic: Traffic[], max: number) {
  if (traffic.length <= max) return traffic;
  const every = traffic.length / max;
  return traffic.filter((_, i) => i % every < 1);
}

export async function freeLiveFlights(now: number): Promise<FlightResult> {
  const area = await freeArea(WORLD, now);
  if (!area.flights.length && area.warning) throw new Error(area.warning);
  return { flights: area.flights, mode: "free" };
}

/** Callsigns that might fly a given flight number: "BA117" → ["BAW117"], "BAW117" → ["BAW117"]. */
export function callsignCandidates(code: string): string[] {
  const c = code.replace(/\s+/g, "").toUpperCase();
  if (/^[A-Z]{3}\d/.test(c)) return [c];
  const m = /^([A-Z0-9]{2})(\d{1,4})([A-Z]?)$/.exec(c);
  if (!m) return [c];
  const cands = airlineIcaoCodes(m[1]).map((icao) => `${icao}${Number(m[2])}${m[3]}`);
  // Prefer callsigns the route database knows.
  return [...cands.filter((x) => routeCodes(x)), ...cands.filter((x) => !routeCodes(x))].slice(0, 3);
}

/**
 * One flight by flight number or callsign. Live if the aircraft is airborne
 * (ADS-B), otherwise route-only from the database (status "unknown").
 */
export async function freeFlight(
  code: string,
  now: number,
  opts: { hex?: string } = {},
): Promise<{ flight: Flight | null; track: TrackPoint[] | null }> {
  const candidates = callsignCandidates(code);
  let state: AircraftState | null = null;
  if (opts.hex && /^[0-9a-f]{6}$/i.test(opts.hex)) state = await aircraftFor(opts.hex.toLowerCase(), null);
  for (const cs of candidates) {
    if (state) break;
    state = await aircraftFor(null, cs);
  }

  if (state) {
    const callsign = state.callsign ?? candidates[0];
    const routed = flightFromState({ ...state, callsign }, now);
    const flight = routed ?? baseFlight(callsign, state, null, now);
    const track = await trackFor(state.hex);
    if (routed && flight.status === "active") {
      const dep = airportForCode(flight.departure.iata);
      const takeoff = dep ? takeoffTime(track, dep) : null;
      if (takeoff && dep) flight.departure = { ...flight.departure, actual: endpoint(dep, { actual: takeoff }).actual };
    }
    return { flight, track };
  }

  // Not airborne (or not covered by receivers): show the route the callsign usually flies.
  const known = candidates.find((cs) => routeCodes(cs));
  if (!known) return { flight: null, track: null };
  const codes = routeCodes(known)!;
  const dep = airportForCode(codes[0]);
  const arr = airportForCode(codes[codes.length - 1]);
  return { flight: baseFlight(known, null, dep && arr ? { dep, arr, status: "unknown" } : null, now), track: null };
}

const STATUS_ORDER: Record<string, number> = { active: 0, scheduled: 1, landed: 2 };

/** Airborne first (soonest arrival first), then at the gate, landed, and route-only entries. */
function sortForList(flights: Flight[]): Flight[] {
  const arr = (f: Flight) => f.arrival.estimated?.utc ?? Infinity;
  return [...flights].sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) || arr(a) - arr(b));
}

/** Search in free mode: flight number / callsign, route, airport or airline. */
export async function freeSearch(q: FlightQuery, now: number): Promise<FlightResult> {
  const code = q.flight_icao ?? q.flight_iata;
  if (code) {
    const { flight } = await freeFlight(code, now);
    return { flights: flight ? [flight] : [], mode: "free" };
  }

  // Everything else needs the global picture of what's airborne now (OpenSky world view)…
  const airports = [q.dep_iata, q.arr_iata].filter((c): c is string => !!c).map(airportForCode).filter((a): a is AirportRecord => !!a);
  const [world, ...nearby] = await Promise.all([
    aircraftInBox(WORLD),
    // …plus a fresh look around the airport(s): catches aircraft at the gate, just landed, and
    // anything the world snapshot missed (and still works when OpenSky's daily credits run out).
    ...airports.map((ap) => adsblolPoint(ap.lat, ap.lon, 250)),
  ]);
  const merged = new Map<string, AircraftState>();
  for (const s of [...world.states, ...nearby.flatMap((r) => (r.ok ? r.states : []))]) {
    const prev = merged.get(s.hex);
    if (!prev || s.updated > prev.updated) merged.set(s.hex, s);
  }
  const states = [...merged.values()];
  const notice =
    world.meta.provider === "OpenSky"
      ? null
      : airports.length
        ? "Worldwide live coverage is limited right now (OpenSky daily credits used up) — showing aircraft near the airport only."
        : "Worldwide live coverage is limited right now (OpenSky daily credits used up), so results may be incomplete.";
  const byCallsign = new Map(states.filter((s) => s.callsign).map((s) => [s.callsign!, s]));
  const live = (callsigns: string[]) =>
    callsigns
      .map((cs) => byCallsign.get(cs))
      .filter((s): s is AircraftState => !!s)
      .map((s) => flightFromState(s, now))
      .filter((f): f is Flight => !!f);

  let flights: Flight[] = [];
  if (q.dep_iata || q.arr_iata) {
    const callsigns = callsignsFor({ from: q.dep_iata, to: q.arr_iata }, 5000);
    const airborne = live(callsigns).filter(
      (f) => (!q.dep_iata || f.departure.iata === q.dep_iata.toUpperCase()) && (!q.arr_iata || f.arrival.iata === q.arr_iata.toUpperCase()),
    );
    flights = airborne;
    // For a specific route, also list the callsigns that operate it (not airborne right now).
    if (q.dep_iata && q.arr_iata) {
      const shown = new Set(airborne.map((f) => f.callsign));
      const dep = airportForCode(q.dep_iata);
      const arr = airportForCode(q.arr_iata);
      for (const cs of callsigns.filter((c) => !shown.has(c)).slice(0, 60)) {
        flights.push(baseFlight(cs, null, dep && arr ? { dep, arr, status: "unknown" } : null, now));
      }
    }
  } else if (q.airline_name || q.airline_iata) {
    const needle = (q.airline_name ?? "").toLowerCase();
    flights = states
      .filter((s) => {
        const a = airlineFromCallsign(s.callsign);
        return a && (q.airline_iata ? a.iata === q.airline_iata.toUpperCase() : a.name.toLowerCase().includes(needle));
      })
      .map((s) => flightFromState(s, now))
      .filter((f): f is Flight => !!f)
      .slice(0, 200);
  }
  return { flights: sortForList(flights), mode: "free", notice };
}
