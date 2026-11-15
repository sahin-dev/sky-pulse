/* ------------------------------------------------------------------ */
/*  Raw aviationstack response shapes (https://aviationstack.com/docs) */
/* ------------------------------------------------------------------ */

/**
 * Where flight data comes from:
 *  - "free": ADS-B positions + open callsign→route database (no paid API; no schedules/gates)
 *  - "aviationstack": aviationstack schedules/status, enriched with ADS-B positions
 *  - "demo": simulated flights (FLIGHT_DATA=demo)
 */
export type DataMode = "free" | "aviationstack" | "demo";

export type FlightStatus =
  | "scheduled"
  | "active"
  | "landed"
  | "cancelled"
  | "incident"
  | "diverted"
  | "unknown";

export interface RawEndpoint {
  airport: string | null;
  timezone: string | null;
  iata: string | null;
  icao: string | null;
  terminal: string | null;
  gate: string | null;
  baggage?: string | null;
  delay: number | null;
  scheduled: string | null;
  estimated: string | null;
  actual: string | null;
  estimated_runway: string | null;
  actual_runway: string | null;
}

export interface RawFlight {
  flight_date: string;
  flight_status: FlightStatus;
  departure: RawEndpoint;
  arrival: RawEndpoint;
  airline: { name: string | null; iata: string | null; icao: string | null };
  flight: {
    number: string | null;
    iata: string | null;
    icao: string | null;
    codeshared: {
      airline_name: string | null;
      airline_iata: string | null;
      airline_icao: string | null;
      flight_number: string | null;
      flight_iata: string | null;
      flight_icao: string | null;
    } | null;
  };
  aircraft: {
    registration: string | null;
    iata: string | null;
    icao: string | null;
    icao24: string | null;
  } | null;
  live: {
    updated: string;
    latitude: number;
    longitude: number;
    altitude: number;
    direction: number;
    speed_horizontal: number;
    speed_vertical: number;
    is_ground: boolean;
  } | null;
}

export interface RawResponse {
  pagination?: { limit: number; offset: number; count: number; total: number };
  data?: RawFlight[];
  error?: {
    code: string;
    type?: string;
    message: string;
    /** validation_error: per-parameter failures */
    context?: Record<string, { key: string; message: string }[]>;
  };
  /** APILayer gateway errors (401) use this shape instead of `error`. */
  message?: string;
  request_id?: string;
}

/* ------------------------------------------------------------------ */
/*  Normalised shapes used by the UI                                   */
/* ------------------------------------------------------------------ */

/** A moment in time: the airport-local wall clock plus the real UTC epoch. */
export interface TimePoint {
  /** Local wall-clock time at the airport, e.g. "2026-11-15T14:05". */
  local: string;
  /** Milliseconds since epoch (UTC). */
  utc: number;
}

export interface Endpoint {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number | null;
  lon: number | null;
  timezone: string;
  terminal: string | null;
  gate: string | null;
  baggage: string | null;
  /** Delay in minutes. */
  delay: number | null;
  scheduled: TimePoint | null;
  estimated: TimePoint | null;
  actual: TimePoint | null;
}

/** Where a live position came from. "airline" = aviationstack's own `live` block. */
export type PositionSource = "adsb" | "airline";

export interface LiveData {
  source: PositionSource;
  /** Provider name for display, e.g. "adsb.lol", "OpenSky", "aviationstack". */
  provider: string;
  /** When the position was last measured (ms epoch). */
  updated: number;
  lat: number;
  lon: number;
  /** metres */
  altitude: number;
  /** degrees */
  heading: number;
  /** km/h */
  speed: number;
  /** km/h */
  verticalSpeed: number;
  isGround: boolean;
}

export interface Flight {
  /** Stable key for lists. */
  key: string;
  date: string;
  status: FlightStatus;
  number: string;
  iata: string;
  icao: string;
  airline: { name: string; iata: string; icao: string };
  codeshare: { airline: string; flight: string } | null;
  aircraft: { registration: string | null; type: string | null; icao24: string | null } | null;
  /** ICAO callsign of the *operating* flight (what ADS-B broadcasts), e.g. "KAC412". */
  callsign: string | null;
  live: LiveData | null;
  departure: Endpoint;
  arrival: Endpoint;
  /**
   * True when route and times are inferred from free data (open route database +
   * ADS-B) rather than an airline schedule: no gates, terminals or official delays.
   */
  inferred?: boolean;
}

export interface FlightQuery {
  flight_iata?: string;
  /** ICAO flight / callsign, e.g. "BAW117" or "QTR31T". */
  flight_icao?: string;
  dep_iata?: string;
  arr_iata?: string;
  airline_name?: string;
  airline_iata?: string;
  flight_status?: FlightStatus;
  limit?: number;
  offset?: number;
}

/** Geographic bounding box: south, west, north, east (degrees). */
export interface BBox {
  s: number;
  w: number;
  n: number;
  e: number;
}

/** One aircraft as seen by an ADS-B network. Units match LiveData: m, km/h, degrees. */
export interface AircraftState {
  hex: string;
  callsign: string | null;
  lat: number;
  lon: number;
  altitude: number | null;
  onGround: boolean;
  speed: number | null;
  track: number | null;
  verticalRate: number | null;
  squawk: string | null;
  registration: string | null;
  type: string | null;
  originCountry: string | null;
  /** When the position was measured (ms epoch). */
  updated: number;
  provider: "OpenSky" | "adsb.lol";
}

/** An ADS-B aircraft that isn't matched to a scheduled flight we know about. */
export interface Traffic extends AircraftState {
  airline: { name: string; iata: string; icao: string } | null;
  /** IATA flight number guessed from the callsign (e.g. BAW117 → BA117); may not exist. */
  flightGuess: string | null;
}

export interface PositionsMeta {
  provider: string | null;
  count: number;
  warning: string | null;
  /** OpenSky anonymous/registered credits left today, when known. */
  creditsRemaining: number | null;
}

/** Point on an actual flown track: [lat, lon, altitude m | null, time ms]. */
export type TrackPoint = [number, number, number | null, number];

export interface AreaResult {
  /** ADS-B aircraft in the area that didn't match a scheduled flight. */
  traffic: Traffic[];
  positions: PositionsMeta;
  flights: Flight[];
  mode: DataMode;
  /** Set when the configured source failed and free data is shown instead. */
  notice?: string | null;
  /** Airports whose live departures were fetched for this area. */
  regional: string[];
  /** Non-fatal problem (e.g. quota hit on the regional fetch). */
  warning: string | null;
  now: number;
}

export interface FlightResult {
  flights: Flight[];
  mode: DataMode;
  /** Set when the configured source failed and free data is shown instead (e.g. aviationstack quota used up). */
  notice?: string | null;
}
