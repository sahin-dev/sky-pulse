import "server-only";
import fs from "node:fs";
import path from "node:path";
import { airportByIata, airportByIcao, type AirportRecord } from "../airports";

/**
 * Open callsign → route database (Virtual Radar Server standing data, CC0),
 * built into src/data/routes.txt by `npm run data:routes`.
 *
 * ~625k routes, ~10 MB. Kept as ONE sorted string plus a line-offset index so
 * lookups are a binary search and memory stays low (no 600k JS objects).
 */
let text: string | null = null;
let offsets: Int32Array | null = null;

function load() {
  if (text) return;
  const file = path.join(process.cwd(), "src", "data", "routes.txt");
  text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const starts: number[] = [];
  for (let i = 0; i < text.length; ) {
    starts.push(i);
    const nl = text.indexOf("\n", i);
    if (nl < 0) break;
    i = nl + 1;
  }
  if (starts.length && starts[starts.length - 1] >= text.length) starts.pop();
  offsets = Int32Array.from(starts);
}

function lineAt(i: number): [string, string] {
  const start = offsets![i];
  const end = text!.indexOf("\n", start);
  const line = text!.slice(start, end < 0 ? undefined : end);
  const sp = line.indexOf(" ");
  return [line.slice(0, sp), line.slice(sp + 1)];
}

export const routesAvailable = () => {
  load();
  return offsets!.length > 0;
};

/** Airport codes (IATA, or ICAO for the few without one) flown under this callsign, e.g. ["LHR","JFK"]. */
export function routeCodes(callsign: string | null | undefined): string[] | null {
  if (!callsign) return null;
  load();
  const key = callsign.replace(/\s+/g, "").toUpperCase();
  let lo = 0;
  let hi = offsets!.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [cs, route] = lineAt(mid);
    if (cs === key) return route.split("-");
    if (cs < key) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

export const airportForCode = (code: string): AirportRecord | null =>
  code.length === 4 ? airportByIcao(code) : airportByIata(code);

/** Callsigns whose route contains `from` then (directly after) `to`, or just one end when the other is null. */
export function callsignsFor(opts: { from?: string | null; to?: string | null }, limit = 400): string[] {
  load();
  const from = opts.from?.toUpperCase() ?? null;
  const to = opts.to?.toUpperCase() ?? null;
  // Fast pre-filter with indexOf over the whole text, then exact checks per line.
  const needle = from && to ? `${from}-${to}` : (from ?? to);
  if (!needle) return [];
  const out: string[] = [];
  const t = text!;
  let at = t.indexOf(needle);
  while (at >= 0 && out.length < limit) {
    const start = t.lastIndexOf("\n", at) + 1;
    const end = t.indexOf("\n", at);
    const line = t.slice(start, end < 0 ? undefined : end);
    const sp = line.indexOf(" ");
    const codes = line.slice(sp + 1).split("-");
    const ok = codes.some((c, i) =>
      from && to ? c === from && codes[i + 1] === to : from ? c === from && i < codes.length - 1 : c === to && i > 0,
    );
    const callsign = line.slice(0, sp);
    if (ok && !out.includes(callsign)) out.push(callsign);
    if (end < 0) break;
    at = t.indexOf(needle, end + 1); // continue on the next line
  }
  return out;
}
