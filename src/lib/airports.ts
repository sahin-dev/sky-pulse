import "server-only";
import data from "@/data/airports.json";
import airlineData from "@/data/airlines.json";

/**
 * [name, city, country, lat, lon, icao, timezone, size]
 * Built from OurAirports (names, coordinates, size: 3 large / 2 medium / 1 small)
 * with IANA time zones from OpenFlights. See README → "Reference data".
 */
type Row = [string, string, string, number, number, string, string, number];
const AIRPORTS = data as unknown as Record<string, Row>;

/** ICAO airline designator → [IATA code, name] (OpenFlights). */
const AIRLINES = airlineData as unknown as Record<string, [string, string]>;

export interface AirportRecord {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
  size: number;
}

const toRecord = (iata: string, r: Row): AirportRecord => ({
  iata,
  name: r[0],
  city: r[1],
  country: r[2],
  lat: r[3],
  lon: r[4],
  icao: r[5],
  timezone: r[6],
  size: r[7] ?? 1,
});

export function airportByIata(iata: string | null | undefined): AirportRecord | null {
  if (!iata) return null;
  const code = iata.toUpperCase();
  const r = AIRPORTS[code];
  return r ? toRecord(code, r) : null;
}

let byIcao: Map<string, string> | null = null;

/** Airport by ICAO code (e.g. "EGLL"), via the same dataset. */
export function airportByIcao(icao: string | null | undefined): AirportRecord | null {
  if (!icao) return null;
  if (!byIcao) {
    byIcao = new Map();
    for (const [iata, r] of Object.entries(AIRPORTS)) if (r[5]) byIcao.set(r[5].toUpperCase(), iata);
  }
  const iata = byIcao.get(icao.toUpperCase());
  return iata ? airportByIata(iata) : null;
}

/** IATA airline code → ICAO designators (e.g. "BA" → ["BAW"]), for turning flight numbers into callsigns. */
let iataToIcao: Map<string, string[]> | null = null;
export function airlineIcaoCodes(iata: string): string[] {
  if (!iataToIcao) {
    iataToIcao = new Map();
    for (const [icao, [code]] of Object.entries(AIRLINES)) {
      if (!code) continue;
      iataToIcao.set(code, [...(iataToIcao.get(code) ?? []), icao]);
    }
  }
  return iataToIcao.get(iata.toUpperCase()) ?? [];
}

/** Airline by ICAO designator. */
export function airlineByIcao(icao: string) {
  const a = AIRLINES[icao.toUpperCase()];
  return a ? { icao: icao.toUpperCase(), iata: a[0], name: a[1] } : null;
}

/** Large airports whose coordinates satisfy `inside` (used to pick regional hubs). */
export function largeAirports(inside: (lat: number, lon: number) => boolean): AirportRecord[] {
  const out: AirportRecord[] = [];
  for (const [iata, r] of Object.entries(AIRPORTS)) {
    if (r[7] === 3 && inside(r[3], r[4])) out.push(toRecord(iata, r));
  }
  return out;
}

/** Simple ranked search used for autocomplete. */
export function searchAirports(query: string, limit = 8): AirportRecord[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored: { score: number; rec: AirportRecord }[] = [];
  for (const iata of Object.keys(AIRPORTS)) {
    const r = AIRPORTS[iata];
    const code = iata.toLowerCase();
    const city = r[1].toLowerCase();
    const name = r[0].toLowerCase();
    let score = 0;
    if (code === q) score = 100;
    else if (city === q) score = 80;
    else if (city.startsWith(q)) score = 60;
    else if (code.startsWith(q)) score = 50;
    else if (name.includes(q)) score = 30;
    else if (r[2].toLowerCase().startsWith(q)) score = 10;
    if (score) {
      score += (r[7] ?? 1) * 4; // prefer bigger airports
      scored.push({ score, rec: toRecord(iata, r) });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.rec);
}

/** Airline from an ICAO callsign like "BAW117" → { icao: "BAW", iata: "BA", name: "British Airways" }. */
export function airlineFromCallsign(callsign: string | null | undefined) {
  const m = /^([A-Z]{3})\d/.exec((callsign ?? "").trim().toUpperCase());
  if (!m) return null;
  const a = AIRLINES[m[1]];
  return a ? { icao: m[1], iata: a[0], name: a[1] } : null;
}
