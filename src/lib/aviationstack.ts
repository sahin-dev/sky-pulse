import "server-only";
import { cacheLife } from "next/cache";
import { airportByIata } from "./airports";
import { mockFlights } from "./mock";
import { dataMode } from "./mode";
import { parseAirportTime } from "./time";
import type { DataMode, Endpoint, Flight, FlightQuery, FlightResult, RawEndpoint, RawFlight, RawResponse } from "./types";

/** APILayer gateway for aviationstack (see the OpenAPI spec's `servers`). Keys from apilayer.com work here. */
const BASE_URL = (process.env.AVIATIONSTACK_BASE_URL || "https://api.apilayer.net/aviationstack/v1").replace(/\/$/, "");

/** Simulated data (FLIGHT_DATA=demo) instead of real aviationstack calls. */
export const isDemoMode = () => dataMode() === "demo";

export class FlightApiError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

/**
 * Errors that mean "aviationstack can't serve us for a while" — quota used up,
 * bad/missing key, inactive account — so the free sources should take over.
 * Value = how long to stop asking aviationstack (ms).
 */
export const UNAVAILABLE_FOR: Record<string, number> = {
  usage_limit_reached: 6 * 3600_000,
  rate_limit_reached: 5 * 60_000,
  invalid_access_key: 3600_000,
  missing_access_key: 3600_000,
  inactive_user: 3600_000,
  function_access_restricted: 3600_000,
  https_access_restricted: 3600_000,
};

export const isUnavailableError = (e: unknown): e is FlightApiError =>
  e instanceof FlightApiError && e.code in UNAVAILABLE_FOR;

const FRIENDLY: Record<string, string> = {
  invalid_access_key: "The aviationstack API key is invalid. Check AVIATIONSTACK_API_KEY in .env.local.",
  missing_access_key: "No aviationstack API key was sent. Set AVIATIONSTACK_API_KEY in .env.local.",
  usage_limit_reached: "The monthly aviationstack request quota has been used up.",
  rate_limit_reached: "Too many requests to aviationstack — please try again in a moment.",
  https_access_restricted: "Your aviationstack plan doesn't support HTTPS. Use http:// for AVIATIONSTACK_BASE_URL.",
  function_access_restricted: "This search isn't available on your aviationstack plan.",
  inactive_user: "The aviationstack account is inactive.",
  validation_error: "aviationstack rejected the search parameters.",
};

/** Turn any aviationstack / APILayer gateway error body into a code + readable message. */
function describeError(status: number, json: RawResponse): { code: string; message: string } {
  if (json.error) {
    const code = json.error.code ?? "api_error";
    // validation_error lists each failing parameter in `context`
    const details = json.error.context
      ? Object.values(json.error.context)
          .flat()
          .map((c) => c.message)
          .filter(Boolean)
          .join(" ")
      : "";
    const base = FRIENDLY[code] ?? json.error.message ?? "aviationstack returned an error.";
    return { code, message: details ? `${base} ${details}` : base };
  }
  // 401s come from the API gateway with a different body: { message, request_id }
  if (status === 401) {
    const missing = /no api key/i.test(json.message ?? "");
    const code = missing ? "missing_access_key" : "invalid_access_key";
    return { code, message: FRIENDLY[code] };
  }
  // The APILayer gateway answers an exhausted plan with HTTP 429 {"message":"Plan limit reached — …"},
  // which is a monthly quota, not a short-lived rate limit.
  if (status === 429) {
    const code = /plan|quota|usage|limit reached/i.test(json.message ?? "") ? "usage_limit_reached" : "rate_limit_reached";
    return { code, message: FRIENDLY[code] };
  }
  return { code: `http_${status}`, message: json.message ?? `aviationstack responded with HTTP ${status}.` };
}

type Profile = "live" | "lookup";
type CachedResult = { ok: true; data: RawFlight[] } | { ok: false; code: string; message: string };

/**
 * Cached aviationstack call. The free plan only allows ~100 requests/month,
 * so results are cached server-side and shared by every visitor.
 */
async function fetchFlightsCached(query: FlightQuery, profile: Profile): Promise<CachedResult> {
  "use cache";

  const params = new URLSearchParams({ access_key: process.env.AVIATIONSTACK_API_KEY ?? "" });
  for (const [k, v] of Object.entries(query)) if (v != null && v !== "") params.set(k, String(v));

  let result: CachedResult;
  try {
    const res = await fetch(`${BASE_URL}/flights?${params}`, { headers: { Accept: "application/json" } });
    const json = (await res.json().catch(() => ({}))) as RawResponse;
    if (json.error || !res.ok) {
      result = { ok: false, ...describeError(res.status, json) };
    } else {
      result = { ok: true, data: json.data ?? [] };
    }
  } catch {
    result = { ok: false, code: "network", message: "Couldn't reach aviationstack. Check your connection and try again." };
  }

  if (!result.ok) {
    // Don't hold on to failures for long, but long enough not to hammer the quota.
    cacheLife({ stale: 30, revalidate: 30, expire: 60 });
  } else if (profile === "live") {
    cacheLife({ stale: 120, revalidate: 600, expire: 1800 });
  } else {
    cacheLife({ stale: 60, revalidate: 180, expire: 900 });
  }
  return result;
}

/* ----------------------------- normalisation ---------------------------- */

const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

function normEndpoint(e: RawEndpoint): Endpoint {
  const ap = airportByIata(e.iata);
  const tz = e.timezone || ap?.timezone || "UTC";
  return {
    iata: e.iata ?? ap?.iata ?? "—",
    icao: e.icao ?? ap?.icao ?? "",
    name: e.airport ?? ap?.name ?? "Unknown airport",
    city: ap?.city ?? e.airport ?? "",
    country: ap?.country ?? "",
    lat: ap?.lat ?? null,
    lon: ap?.lon ?? null,
    timezone: tz,
    terminal: e.terminal,
    gate: e.gate,
    baggage: e.baggage ?? null,
    delay: e.delay,
    scheduled: parseAirportTime(e.scheduled, tz),
    estimated: parseAirportTime(e.estimated, tz),
    actual: parseAirportTime(e.actual ?? e.actual_runway, tz),
  };
}

export function normalizeFlight(r: RawFlight): Flight {
  const departure = normEndpoint(r.departure);
  const arrival = normEndpoint(r.arrival);
  const iata = r.flight.iata ?? `${r.airline.iata ?? ""}${r.flight.number ?? ""}`;
  const cs = r.flight.codeshared;
  return {
    key: `${iata}-${r.flight_date}-${departure.iata}`,
    date: r.flight_date,
    status: r.flight_status ?? "unknown",
    number: r.flight.number ?? "",
    iata,
    icao: r.flight.icao ?? "",
    airline: { name: r.airline.name ?? "Unknown airline", iata: r.airline.iata ?? "", icao: r.airline.icao ?? "" },
    // codeshare fields arrive lower-cased (e.g. "kuwait airways", "ku412")
    codeshare: cs ? { airline: titleCase(cs.airline_name ?? ""), flight: (cs.flight_iata ?? "").toUpperCase() } : null,
    aircraft: r.aircraft
      ? { registration: r.aircraft.registration, type: r.aircraft.iata ?? r.aircraft.icao, icao24: r.aircraft.icao24 }
      : null,
    // ADS-B broadcasts the operating flight's ICAO callsign; for a codeshare that's the codeshared block.
    callsign: ((cs ? cs.flight_icao : r.flight.icao) ?? "").toUpperCase() || null,
    live: r.live
      ? {
          source: "airline" as const,
          provider: "aviationstack",
          updated: Date.parse(r.live.updated),
          lat: r.live.latitude,
          lon: r.live.longitude,
          altitude: r.live.altitude,
          heading: r.live.direction,
          speed: r.live.speed_horizontal,
          verticalSpeed: r.live.speed_vertical,
          isGround: r.live.is_ground,
        }
      : null,
    departure,
    arrival,
  };
}

/** Collapse marketing codeshares onto the operating flight, keeping unique keys. */
function dedupe(flights: Flight[]): Flight[] {
  const seen = new Map<string, Flight>();
  for (const f of flights) {
    const opKey = `${f.codeshare?.flight || f.iata}-${f.date}-${f.departure.iata}`;
    const existing = seen.get(opKey);
    if (!existing || (existing.codeshare && !f.codeshare)) seen.set(opKey, f);
  }
  return [...seen.values()];
}

/* -------------------------------- public -------------------------------- */

async function query(q: FlightQuery, profile: Profile, now: number): Promise<FlightResult> {
  if (isDemoMode()) {
    return { flights: mockFlights(q, now).map(normalizeFlight), mode: "demo" };
  }
  const res = await fetchFlightsCached(q, profile);
  if (!res.ok) throw new FlightApiError(res.message, res.code);
  return { flights: res.data.map(normalizeFlight), mode: "aviationstack" };
}

const envInt = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Results per request: 100 below the Professional plan, up to 1000 on it and above. */
export const PAGE_LIMIT = envInt(process.env.AVIATIONSTACK_PAGE_LIMIT, 100, 1, 1000);
/** How many pages of airborne flights make up the global snapshot (each page = 1 request per refresh). */
export const SNAPSHOT_PAGES = envInt(process.env.AVIATIONSTACK_SNAPSHOT_PAGES, 1, 1, 50);

/** Only keep flights we can place on a map. */
const positionable = (f: Flight) => !!f.live || (f.departure.lat != null && f.arrival.lat != null);

function mergeFlights(lists: Flight[][]): Flight[] {
  return dedupe(lists.flat())
    .filter(positionable)
    .sort((a, b) => Number(!!b.live) - Number(!!a.live));
}

/**
 * Global snapshot of airborne flights, shared by every visitor and every map pan.
 * Each page is cached individually (see fetchFlightsCached), so browsing the map
 * costs no extra API requests until the cache expires.
 */
export async function getActiveSnapshot(now: number): Promise<FlightResult> {
  const pages = await Promise.all(
    Array.from({ length: SNAPSHOT_PAGES }, (_, i) =>
      query({ flight_status: "active", limit: PAGE_LIMIT, offset: i * PAGE_LIMIT }, "live", now),
    ),
  );
  return { flights: mergeFlights(pages.map((p) => p.flights)), mode: pages[0]?.mode ?? (isDemoMode() ? "demo" : "aviationstack") };
}

/** Airborne flights that departed from one airport — used to fill in a region the user zoomed into. */
export async function getActiveDepartures(iata: string, now: number): Promise<FlightResult> {
  const res = await query({ flight_status: "active", dep_iata: iata, limit: PAGE_LIMIT }, "live", now);
  return { ...res, flights: mergeFlights([res.flights]) };
}

export { mergeFlights };

/** Flights currently in the air (initial radar render). */
export async function getLiveFlights(now: number): Promise<FlightResult> {
  return getActiveSnapshot(now);
}

export async function searchFlights(q: FlightQuery, now: number): Promise<FlightResult> {
  const res = await query({ limit: 100, ...q }, "lookup", now);
  const flights = q.flight_iata ? res.flights : dedupe(res.flights);
  const rank = { active: 0, scheduled: 1, landed: 2 } as Record<string, number>;
  flights.sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || depTime(a) - depTime(b));
  return { ...res, flights };
}

const depTime = (f: Flight) => f.departure.scheduled?.utc ?? 0;

/**
 * Most relevant instance of a flight number: an explicit date / origin if given,
 * otherwise the one in the air, otherwise the one closest to now.
 */
export async function getFlight(
  code: string,
  now: number,
  opts: { date?: string; dep?: string } = {},
): Promise<{ flight: Flight | null; others: Flight[]; mode: DataMode }> {
  const upper = code.toUpperCase();
  const q: FlightQuery = /^[A-Z]{3}\d/.test(upper) ? { flight_icao: upper } : { flight_iata: upper };
  const res = await query(q, "lookup", now);
  let list = res.flights;
  if (opts.date) list = list.filter((f) => f.date === opts.date);
  if (opts.dep) list = list.filter((f) => f.departure.iata === opts.dep!.toUpperCase());
  if (!list.length) list = res.flights;

  const active = list.find((f) => f.status === "active");
  const flight =
    active ??
    [...list].sort((a, b) => Math.abs(depTime(a) - now) - Math.abs(depTime(b) - now))[0] ??
    null;
  const others = res.flights.filter((f) => f !== flight).sort((a, b) => depTime(b) - depTime(a));
  return { flight, others, mode: res.mode };
}
