import "server-only";
import { cacheLife } from "next/cache";
import type { AirportWeather, Metar } from "./types";

/**
 * Airport weather from the Aviation Weather Center data API (aviationweather.gov,
 * US government — public domain, no key): METAR observations and TAF forecasts.
 * https://aviationweather.gov/data/api/
 */
const API = "https://aviationweather.gov/api/data";
const UA = { "User-Agent": "SkyPulse flight tracker", Accept: "application/json" };

interface RawMetar {
  icaoId: string;
  obsTime: number;
  temp: number | null;
  dewp: number | null;
  wdir: number | "VRB" | null;
  wspd: number | null;
  wgst?: number | null;
  visib: number | string | null;
  altim: number | null;
  fltCat?: string | null;
  clouds?: { cover: string; base: number | null }[];
  wxString?: string | null;
  rawOb: string;
  name?: string;
}
interface RawTaf {
  icaoId: string;
  issueTime: string;
  validTimeFrom: number;
  validTimeTo: number;
  rawTAF: string;
}

/** Visibility arrives in statute miles ("10+", "6+" or a number) → km, with "+" meaning "at least". */
function visibilityKm(v: RawMetar["visib"]): { km: number | null; atLeast: boolean } {
  if (v == null) return { km: null, atLeast: false };
  const s = String(v);
  const miles = Number.parseFloat(s);
  if (!Number.isFinite(miles)) return { km: null, atLeast: false };
  return { km: Math.round(miles * 1.609 * 10) / 10, atLeast: s.endsWith("+") };
}

const CATEGORIES = new Set(["VFR", "MVFR", "IFR", "LIFR"]);

function toMetar(m: RawMetar): Metar {
  const vis = visibilityKm(m.visib);
  return {
    station: m.icaoId,
    observed: m.obsTime * 1000,
    temperature: m.temp,
    dewpoint: m.dewp,
    windDirection: m.wdir === "VRB" ? "variable" : m.wdir,
    windSpeed: m.wspd,
    windGust: m.wgst ?? null,
    visibilityKm: vis.km,
    visibilityAtLeast: vis.atLeast,
    pressureHpa: m.altim != null ? Math.round(m.altim) : null,
    category: m.fltCat && CATEGORIES.has(m.fltCat) ? (m.fltCat as Metar["category"]) : null,
    clouds: (m.clouds ?? []).map((c) => ({ cover: c.cover, baseFt: c.base })),
    weather: m.wxString || null,
    raw: m.rawOb,
  };
}

/**
 * Latest METAR + TAF for up to a few airports (ICAO codes). Cached ~10 minutes —
 * METARs are issued every 30–60 minutes. Never throws: missing data is just absent.
 */
export async function airportWeather(icaoCodes: string[]): Promise<Record<string, AirportWeather>> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });

  const ids = [...new Set(icaoCodes.filter((c) => /^[A-Z0-9]{4}$/.test(c)).map((c) => c.toUpperCase()))].slice(0, 10);
  const out: Record<string, AirportWeather> = {};
  if (!ids.length) return out;
  for (const id of ids) out[id] = { metar: null, taf: null };

  const get = async <T,>(kind: "metar" | "taf"): Promise<T[]> => {
    try {
      const res = await fetch(`${API}/${kind}?ids=${ids.join(",")}&format=json`, { headers: UA });
      if (!res.ok) return [];
      const text = await res.text();
      return text.trim() ? (JSON.parse(text) as T[]) : [];
    } catch {
      return [];
    }
  };
  const [metars, tafs] = await Promise.all([get<RawMetar>("metar"), get<RawTaf>("taf")]);

  for (const m of metars) if (out[m.icaoId] && !out[m.icaoId].metar) out[m.icaoId].metar = toMetar(m);
  for (const t of tafs) {
    if (out[t.icaoId] && !out[t.icaoId].taf) {
      out[t.icaoId].taf = { raw: t.rawTAF, issued: Date.parse(t.issueTime), validFrom: t.validTimeFrom * 1000, validTo: t.validTimeTo * 1000 };
    }
  }
  return out;
}
