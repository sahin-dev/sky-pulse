import "server-only";
import { airportByIata } from "./airports";
import { distanceKm, interpolate, bearing, type LatLon } from "./geo";
import { toAirportWallClock } from "./time";
import type { FlightQuery, FlightStatus, RawEndpoint, RawFlight } from "./types";

/**
 * Demo data used when no AVIATIONSTACK_API_KEY is configured. It produces
 * responses in the exact aviationstack shape (including the "local time
 * labelled +00:00" quirk) so it exercises the same normalisation code path.
 * Flights cycle deterministically so the board always shows something in the air.
 */

interface Route {
  code: string;
  airline: [name: string, iata: string, icao: string];
  dep: string;
  arr: string;
  aircraft: string;
}

const AIRLINES: Record<string, [string, string, string]> = {
  BA: ["British Airways", "BA", "BAW"],
  EK: ["Emirates", "EK", "UAE"],
  SQ: ["Singapore Airlines", "SQ", "SIA"],
  QF: ["Qantas", "QF", "QFA"],
  AA: ["American Airlines", "AA", "AAL"],
  UA: ["United Airlines", "UA", "UAL"],
  DL: ["Delta Air Lines", "DL", "DAL"],
  LH: ["Lufthansa", "LH", "DLH"],
  AF: ["Air France", "AF", "AFR"],
  NH: ["All Nippon Airways", "NH", "ANA"],
  QR: ["Qatar Airways", "QR", "QTR"],
  TK: ["Turkish Airlines", "TK", "THY"],
  CX: ["Cathay Pacific", "CX", "CPA"],
  JL: ["Japan Airlines", "JL", "JAL"],
  KL: ["KLM", "KL", "KLM"],
  AI: ["Air India", "AI", "AIC"],
  LA: ["LATAM Airlines", "LA", "LAN"],
  EY: ["Etihad Airways", "EY", "ETD"],
  AC: ["Air Canada", "AC", "ACA"],
};

const ROUTES: Route[] = [
  ["BA117", "LHR", "JFK", "B77W"],
  ["EK203", "DXB", "JFK", "A388"],
  ["SQ322", "SIN", "LHR", "A359"],
  ["QF11", "SYD", "LAX", "A388"],
  ["AA100", "JFK", "LHR", "B77W"],
  ["UA857", "SFO", "PVG", "B77W"],
  ["DL900", "ATL", "LAX", "A321"],
  ["LH400", "FRA", "JFK", "B748"],
  ["AF006", "CDG", "JFK", "A359"],
  ["NH8", "NRT", "SFO", "B789"],
  ["QR701", "DOH", "JFK", "B77W"],
  ["TK1", "IST", "JFK", "A359"],
  ["CX888", "HKG", "YVR", "B77W"],
  ["JL41", "HND", "LHR", "B77W"],
  ["KL641", "AMS", "JFK", "A332"],
  ["AI101", "DEL", "JFK", "B77W"],
  ["LA705", "MAD", "SCL", "B789"],
  ["EY101", "AUH", "JFK", "B789"],
  ["AC33", "YVR", "SYD", "B789"],
  ["EK7", "DXB", "LHR", "A388"],
  ["LH100", "FRA", "MUC", "A320"],
  ["SQ221", "SIN", "SYD", "A359"],
].map(([code, dep, arr, aircraft]) => ({
  code,
  dep,
  arr,
  aircraft,
  airline: AIRLINES[code.slice(0, 2)],
}));

const HUBS = ["JFK", "LHR", "CDG", "DXB", "SIN", "HND", "LAX", "FRA", "AMS", "IST", "DOH", "SYD", "HKG", "ORD", "MAD", "GRU", "YYZ", "BKK", "ICN", "DEL"];

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Build a plausible route for any flight code so every search "works" in demo mode. */
function synthRoute(code: string): Route {
  const h = hash(code);
  const dep = HUBS[h % HUBS.length];
  let arr = HUBS[(h >>> 5) % HUBS.length];
  if (arr === dep) arr = HUBS[(HUBS.indexOf(dep) + 7) % HUBS.length];
  const prefix = code.slice(0, 2);
  const airline = AIRLINES[prefix] ?? [`${prefix} Airways`, prefix, `${prefix}X`];
  return { code, dep, arr, aircraft: ["A359", "B789", "A321", "B77W"][h % 4], airline };
}

function endpoint(iata: string, sched: number, est: number, actual: number | null, delay: number, h: number, isArr: boolean): RawEndpoint {
  const ap = airportByIata(iata)!;
  const tz = ap.timezone || "UTC";
  return {
    airport: ap.name,
    timezone: tz,
    iata,
    icao: ap.icao,
    terminal: String(1 + (h % 5)),
    gate: `${"ABCDEFG"[h % 7]}${1 + (h % 40)}`,
    baggage: isArr ? String(1 + (h % 12)) : null,
    delay: delay || null,
    scheduled: toAirportWallClock(sched, tz),
    estimated: toAirportWallClock(est, tz),
    actual: actual != null ? toAirportWallClock(actual, tz) : null,
    estimated_runway: null,
    actual_runway: actual != null ? toAirportWallClock(actual, tz) : null,
  };
}

function buildFlight(route: Route, now: number): RawFlight | null {
  const depAp = airportByIata(route.dep);
  const arrAp = airportByIata(route.arr);
  if (!depAp || !arrAp) return null;

  const a: LatLon = [depAp.lat, depAp.lon];
  const b: LatLon = [arrAp.lat, arrAp.lon];
  const km = distanceKm(a, b);
  const durMs = Math.round((km / 830) * 60 + 35) * 60_000; // cruise ~830km/h + taxi/climb
  const h = hash(route.code);
  const turnaround = 3 * 3600_000;
  const period = durMs + turnaround;
  const seed = (h % 1000) / 1000 * period;
  const delay = h % 3 === 0 ? 5 + (h % 40) : 0;
  const delayMs = delay * 60_000;

  // Most recent cycle start; if it landed > 75 min ago, show the next departure instead.
  let sched = Math.floor((now - seed) / period) * period + seed;
  if (now > sched + delayMs + durMs + 75 * 60_000) sched += period;

  const depAt = sched + delayMs;
  const arrAt = depAt + durMs;
  const started = now >= depAt;
  const landed = now >= arrAt;
  const status: FlightStatus = landed ? "landed" : started ? "active" : "scheduled";

  let live: RawFlight["live"] = null;
  if (status === "active") {
    const f = (now - depAt) / durMs;
    const pos = interpolate(a, b, f);
    const next = interpolate(a, b, Math.min(1, f + 0.002));
    const climb = Math.min(1, f / 0.08, (1 - f) / 0.1);
    live = {
      updated: new Date(now - 90_000).toISOString(),
      latitude: +pos[0].toFixed(4),
      longitude: +pos[1].toFixed(4),
      altitude: Math.round(11_300 * climb + (h % 900)),
      direction: Math.round(bearing(pos, next)),
      speed_horizontal: Math.round(450 + 420 * climb + (h % 60)),
      speed_vertical: climb < 1 ? (f < 0.5 ? 9 : -8) : 0,
      is_ground: false,
    };
  }

  const regPrefix = { BA: "G-", EK: "A6-", SQ: "9V-", QF: "VH-", LH: "D-", AF: "F-", QR: "A7-", TK: "TC-", CX: "B-", KL: "PH-", AI: "VT-", EY: "A6-", AC: "C-", NH: "JA", JL: "JA" }[route.airline[1]] ?? "N";
  const reg = regPrefix + ((h >>> 3) % 46656).toString(36).toUpperCase().padStart(3, "A");

  return {
    flight_date: toAirportWallClock(sched, depAp.timezone || "UTC").slice(0, 10),
    flight_status: status,
    departure: endpoint(route.dep, sched, depAt, started ? depAt : null, delay, h, false),
    arrival: endpoint(route.arr, sched + durMs, arrAt, landed ? arrAt : null, delay, h >>> 7, true),
    airline: { name: route.airline[0], iata: route.airline[1], icao: route.airline[2] },
    flight: {
      number: route.code.slice(2),
      iata: route.code,
      icao: route.airline[2] + route.code.slice(2),
      codeshared: null,
    },
    aircraft: { registration: reg, iata: route.aircraft, icao: route.aircraft, icao24: (h % 0xffffff).toString(16).padStart(6, "0") },
    live,
  };
}

/** A denser deterministic network between hubs so map browsing has traffic everywhere in demo mode. */
const NETWORK: Route[] = (() => {
  const codes = Object.keys(AIRLINES);
  const out: Route[] = [];
  for (let i = 0; i < HUBS.length; i++) {
    for (let j = 0; j < HUBS.length; j++) {
      if (i === j) continue;
      const h = hash(`${HUBS[i]}-${HUBS[j]}`);
      if (h % 4 !== 0) continue;
      const al = codes[h % codes.length];
      out.push({
        code: `${al}${100 + (h % 8800)}`,
        dep: HUBS[i],
        arr: HUBS[j],
        aircraft: ["A359", "B789", "A321", "B77W", "A20N", "B38M"][h % 6],
        airline: AIRLINES[al],
      });
    }
  }
  return out;
})();

export function mockFlights(q: FlightQuery, now: number): RawFlight[] {
  let routes = q.flight_iata ? ROUTES : [...ROUTES, ...NETWORK];
  if (q.flight_iata) {
    const code = q.flight_iata.toUpperCase();
    routes = routes.filter((r) => r.code === code);
    if (!routes.length && /^[A-Z0-9]{2}\d{1,4}$/.test(code)) routes = [synthRoute(code)];
  }
  let flights = routes.map((r) => buildFlight(r, now)).filter((f): f is RawFlight => !!f);
  if (q.dep_iata) flights = flights.filter((f) => f.departure.iata === q.dep_iata!.toUpperCase());
  if (q.arr_iata) flights = flights.filter((f) => f.arrival.iata === q.arr_iata!.toUpperCase());
  if (q.airline_iata) flights = flights.filter((f) => f.airline.iata === q.airline_iata!.toUpperCase());
  if (q.airline_name) {
    const n = q.airline_name.toLowerCase();
    flights = flights.filter((f) => f.airline.name?.toLowerCase().includes(n));
  }
  if (q.flight_status) flights = flights.filter((f) => f.flight_status === q.flight_status);
  const offset = q.offset ?? 0;
  return flights.slice(offset, offset + (q.limit ?? 100));
}
