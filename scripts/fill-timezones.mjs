#!/usr/bin/env node
/**
 * Fills in missing IANA time zones in src/data/airports.json from each airport's
 * coordinates (offline lookup via the `geo-tz` package and the timezone-boundary-builder
 * data it bundles). OurAirports has no time-zone column, so ~1/3 of airports need this;
 * without it their local times would be shown in UTC.
 *
 *   npm run data:timezones
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { find } from "geo-tz";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "src/data/airports.json");
const airports = JSON.parse(fs.readFileSync(file, "utf8"));

let filled = 0;
let unresolved = 0;
for (const row of Object.values(airports)) {
  if (row[6]) continue;
  const [lat, lon] = [row[3], row[4]];
  // Ocean "Etc/GMT±N" zones mean the point fell outside land boundaries — not useful for an airport.
  const zone = find(lat, lon).find((z) => !z.startsWith("Etc/"));
  if (zone) {
    row[6] = zone;
    filled++;
  } else unresolved++;
}
fs.writeFileSync(file, JSON.stringify(airports));
console.log(`time zones: ${filled} filled, ${unresolved} unresolved, ${Object.values(airports).filter((r) => r[6]).length}/${Object.keys(airports).length} airports now have one`);
