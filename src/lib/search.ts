import type { FlightQuery } from "./types";

export type SearchKind = "flight" | "route" | "airport" | "airline";

export interface ParsedSearch {
  kind: SearchKind;
  query: FlightQuery;
  label: string;
}

const FLIGHT_RE = /^([A-Z0-9]{2})\s?(\d{1,4}[A-Z]?)$/;
const CALLSIGN_RE = /^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/;
const ROUTE_RE = /^([A-Z]{3})\s*(?:-|>|→|TO|\s)\s*([A-Z]{3})$/;

/**
 * Turn free text into an aviationstack query:
 *   "BA117" / "ba 117"      → flight number
 *   "JFK-LHR" / "JFK to LHR" → route
 *   "DXB"                   → departures from an airport
 *   anything else           → airline name
 */
export function parseSearch(input: string, mode?: string | null): ParsedSearch | null {
  const raw = input.trim();
  if (!raw) return null;
  const q = raw.toUpperCase().replace(/\s+/g, " ");

  if (mode === "arrivals" && /^[A-Z]{3}$/.test(q)) {
    return { kind: "airport", query: { arr_iata: q }, label: `Arrivals at ${q}` };
  }

  if (CALLSIGN_RE.test(q.replace(/\s+/g, ""))) {
    const code = q.replace(/\s+/g, "");
    return { kind: "flight", query: { flight_icao: code }, label: `Callsign ${code}` };
  }
  let m = FLIGHT_RE.exec(q);
  if (m && /\d/.test(m[1] + m[2]) && !/^[A-Z]{3}$/.test(q)) {
    const code = `${m[1]}${m[2]}`;
    return { kind: "flight", query: { flight_iata: code }, label: `Flight ${code}` };
  }
  m = ROUTE_RE.exec(q);
  if (m) {
    return { kind: "route", query: { dep_iata: m[1], arr_iata: m[2] }, label: `${m[1]} → ${m[2]}` };
  }
  if (/^[A-Z]{3}$/.test(q)) {
    return { kind: "airport", query: { dep_iata: q }, label: `Departures from ${q}` };
  }
  return { kind: "airline", query: { airline_name: raw }, label: `${raw} flights` };
}

export function flightHref(f: {
  iata: string;
  date: string;
  departure: { iata: string };
  inferred?: boolean;
  callsign?: string | null;
  aircraft?: { icao24: string | null } | null;
}) {
  if (f.inferred && f.callsign) {
    const hex = f.aircraft?.icao24?.toLowerCase();
    return `/flight/${encodeURIComponent(f.callsign)}${hex ? `?hex=${hex}` : ""}`;
  }
  const p = new URLSearchParams({ date: f.date, dep: f.departure.iata });
  return `/flight/${encodeURIComponent(f.iata)}?${p}`;
}
