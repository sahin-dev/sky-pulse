#!/usr/bin/env node
/**
 * Builds src/data/routes.txt from the open route database of Virtual Radar Server
 * ("standing data", CC0 — https://github.com/vradarserver/standing-data).
 *
 *   npm run data:routes                  # download the latest data and rebuild
 *   npm run data:routes -- <dir>         # use an already extracted standing-data checkout
 *
 * Output: one line per callsign, sorted, "CALLSIGN CODE-CODE[-CODE…]".
 * Airport codes are IATA when known (3 chars), otherwise ICAO (4 chars). Routes through
 * airports missing from src/data/airports.json are dropped (they can't be drawn).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const airports = JSON.parse(fs.readFileSync(path.join(root, "src/data/airports.json"), "utf8"));
const out = path.join(root, "src/data/routes.txt");

// ICAO → IATA for every airport we can place on a map.
const icaoToIata = new Map();
for (const [iata, row] of Object.entries(airports)) if (row[5]) icaoToIata.set(row[5].toUpperCase(), iata);

async function sourceDir() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "standing-data-"));
  const tarball = path.join(tmp, "sd.tar.gz");
  console.log("Downloading standing data…");
  const res = await fetch("https://codeload.github.com/vradarserver/standing-data/tar.gz/refs/heads/main");
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  fs.writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  execFileSync("tar", ["-xzf", tarball, "-C", tmp], { stdio: "inherit" });
  return path.join(tmp, "standing-data-main");
}

function* csvFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* csvFiles(p);
    else if (entry.name.endsWith(".csv")) yield p;
  }
}

const src = await sourceDir();
const dir = path.join(src, "routes", "schema-01");
const routes = new Map();
let rows = 0;
let dropped = 0;
for (const file of csvFiles(dir)) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const cols = line.replace(/^﻿/, "").split(",");
    if (cols.length < 5 || cols[0] === "Callsign") continue;
    rows++;
    const callsign = cols[0].trim().toUpperCase();
    const codes = cols[4].trim().toUpperCase().split("-").filter(Boolean);
    if (!/^[A-Z0-9]{3,8}$/.test(callsign) || codes.length < 2) continue;
    const mapped = codes.map((c) => (c.length === 4 ? icaoToIata.get(c) : airports[c] ? c : undefined));
    if (mapped.some((c) => !c)) {
      dropped++;
      continue;
    }
    routes.set(callsign, mapped.join("-"));
  }
}

const lines = [...routes.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([c, r]) => `${c} ${r}`);
fs.writeFileSync(out, lines.join("\n") + "\n");
console.log(`routes: ${rows} read, ${lines.length} kept, ${dropped} dropped (unknown airports) → ${path.relative(root, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);

/* Airlines: ICAO → [IATA, name]. Standing data (maintained, CC0) wins; existing entries
   (OpenFlights) are kept only for designators it doesn't know. */
function parseCsvLine(line) {
  const cells = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}
const airlinesOut = path.join(root, "src/data/airlines.json");
const airlines = fs.existsSync(airlinesOut) ? JSON.parse(fs.readFileSync(airlinesOut, "utf8")) : {};
let fromStanding = 0;
const airlinesCsv = path.join(src, "airlines", "schema-01", "airlines.csv");
for (const line of fs.readFileSync(airlinesCsv, "utf8").split(/\r?\n/)) {
  const [, name, icao, iata] = parseCsvLine(line.replace(/^﻿/, ""));
  if (!/^[A-Z]{3}$/.test(icao ?? "") || !name || name === "Name") continue;
  airlines[icao] = [/^[A-Z0-9]{2}$/.test(iata ?? "") ? iata : "", name];
  fromStanding++;
}
fs.writeFileSync(airlinesOut, JSON.stringify(airlines));
console.log(`airlines: ${fromStanding} from standing data, ${Object.keys(airlines).length} total → ${path.relative(root, airlinesOut)}`);

const readCsvRows = (file) =>
  fs
    .readFileSync(file, "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(1)
    .map(parseCsvLine);

/* Aircraft types: ICAO designator → [manufacturer, model, engines, engine type (J/T/P/…), wake (L/M/H/J)].
   A designator has many alias rows ("777-200LR", "777-200LR BBJ", "777-F"). Pick the most
   "central" name — sharing the longest prefixes with the other aliases — among active rows,
   avoiding marketing/VIP variants; ties go to the shorter name. */
const byDesignator = new Map();
for (const file of csvFiles(path.join(src, "model-type", "schema-01"))) {
  for (const [icao, manufacturer, model, engines, engineType, , , wake, active] of readCsvRows(file)) {
    if (!/^[A-Z0-9]{2,4}$/.test(icao ?? "") || !model) continue;
    const rows = byDesignator.get(icao) ?? [];
    rows.push({ manufacturer, model: model.trim(), engines, engineType, wake, active: active === "1" });
    byDesignator.set(icao, rows);
  }
}
const commonPrefix = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
  return i;
};
const types = {};
for (const [icao, rows] of byDesignator) {
  const pool = rows.some((r) => r.active) ? rows.filter((r) => r.active) : rows;
  const scored = pool.map((r) => ({
    r,
    score:
      pool.reduce((sum, o) => (o === r ? sum : sum + commonPrefix(r.model, o.model)), 0) -
      (/\b(BBJ|VIP|Prestige|ACJ)\b|\(|^[A-Z]+ [A-Z]-/i.test(r.model) ? 100 : 0),
  }));
  scored.sort((a, b) => b.score - a.score || a.r.model.length - b.r.model.length);
  const best = scored[0].r;
  types[icao] = [best.manufacturer, best.model, Number(best.engines) || null, best.engineType || null, best.wake || null];
}
const typesOut = path.join(root, "src/data/aircraft-types.json");
fs.writeFileSync(typesOut, JSON.stringify(types));
console.log(`aircraft types: ${Object.keys(types).length} → ${path.relative(root, typesOut)}`);

/* Aircraft registry: one sorted line per ICAO 24-bit address, "hex reg|type|operator|year",
   read at runtime with a binary search (like routes.txt). */
const aircraft = new Map();
for (const file of csvFiles(path.join(src, "aircraft", "schema-01"))) {
  for (const [icao24, reg, modelIcao, , , , , operator, , , year] of readCsvRows(file)) {
    if (!/^[0-9A-F]{6}$/i.test(icao24 ?? "")) continue;
    const clean = (v) => (v ?? "").replace(/[|\n\r]/g, " ").trim();
    aircraft.set(icao24.toLowerCase(), [clean(reg), clean(modelIcao), clean(operator), /^\d{4}$/.test(year ?? "") ? year : ""].join("|"));
  }
}
const aircraftOut = path.join(root, "src/data/aircraft.txt");
const aircraftLines = [...aircraft.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([h, v]) => `${h} ${v}`);
fs.writeFileSync(aircraftOut, aircraftLines.join("\n") + "\n");
console.log(`aircraft: ${aircraftLines.length} → ${path.relative(root, aircraftOut)} (${(fs.statSync(aircraftOut).size / 1e6).toFixed(1)} MB)`);
