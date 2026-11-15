import "server-only";
import fs from "node:fs";
import path from "node:path";
import typeData from "@/data/aircraft-types.json";

/**
 * Aircraft reference data from Virtual Radar Server standing data (CC0),
 * built by `npm run data:standing`:
 *  - aircraft-types.json: ICAO type designator → manufacturer, model, engines, wake category
 *  - aircraft.txt: ICAO 24-bit address → registration, type, operator, year built
 */
type TypeRow = [manufacturer: string, model: string, engines: number | null, engineType: string | null, wake: string | null];
const TYPES = typeData as unknown as Record<string, TypeRow>;

const ENGINE_TYPES: Record<string, string> = { J: "jet", T: "turboprop", P: "piston", E: "electric" };
const WAKE: Record<string, string> = { L: "Light", M: "Medium", H: "Heavy", J: "Super" };

export interface AircraftTypeInfo {
  /** e.g. "Boeing 777-200LR" */
  name: string;
  manufacturer: string;
  engines: number | null;
  /** e.g. "twin jet" */
  engineDescription: string | null;
  wake: string | null;
}

export function aircraftType(designator: string | null | undefined): AircraftTypeInfo | null {
  if (!designator) return null;
  const row = TYPES[designator.toUpperCase()];
  if (!row) return null;
  const [manufacturer, model, engines, engineType, wake] = row;
  // Avoid "ATR ATR-72-600" when the model already starts with the maker's name.
  const name = model.toLowerCase().startsWith(manufacturer.toLowerCase()) ? model : `${manufacturer} ${model}`;
  const count = engines ? ({ 1: "single", 2: "twin", 3: "three-engine", 4: "four-engine" } as Record<number, string>)[engines] : null;
  const kind = engineType ? ENGINE_TYPES[engineType] : null;
  return {
    name,
    manufacturer,
    engines,
    engineDescription: kind ? [count, kind].filter(Boolean).join(" ") : null,
    wake: wake ? (WAKE[wake] ?? null) : null,
  };
}

/**
 * Complete what a data source knows about an aircraft with the reference data:
 * fills registration/type when missing and adds the full type name, operator and build year.
 */
export function describeAircraft(a: { hex?: string | null; registration?: string | null; type?: string | null }) {
  const reg = aircraftByHex(a.hex);
  const type = a.type || reg?.type || null;
  return {
    registration: a.registration || reg?.registration || null,
    type,
    icao24: a.hex ? a.hex.toUpperCase() : null,
    typeName: aircraftType(type)?.name ?? null,
    operator: reg?.operator ?? null,
    yearBuilt: reg?.yearBuilt ?? null,
  };
}

/* ------------------------------ registry ------------------------------ */

let text: string | null = null;
let offsets: Int32Array | null = null;

function load() {
  if (text) return;
  const file = path.join(process.cwd(), "src", "data", "aircraft.txt");
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

export interface RegisteredAircraft {
  registration: string | null;
  type: string | null;
  operator: string | null;
  yearBuilt: number | null;
}

/** Registry entry by ICAO 24-bit address (hex). */
export function aircraftByHex(hex: string | null | undefined): RegisteredAircraft | null {
  if (!hex) return null;
  load();
  const key = hex.toLowerCase();
  let lo = 0;
  let hi = offsets!.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = offsets![mid];
    const end = text!.indexOf("\n", start);
    const line = text!.slice(start, end < 0 ? undefined : end);
    const h = line.slice(0, 6);
    if (h === key) {
      const [reg, type, operator, year] = line.slice(7).split("|");
      return { registration: reg || null, type: type || null, operator: operator || null, yearBuilt: year ? Number(year) : null };
    }
    if (h < key) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}
