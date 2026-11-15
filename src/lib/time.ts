import type { TimePoint } from "./types";

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string) {
  let f = offsetFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormatters.set(tz, f);
  }
  return f;
}

/** Offset (ms) of `tz` from UTC at the instant `utc`. */
function tzOffset(tz: string, utc: number): number {
  const parts = formatterFor(tz).formatToParts(new Date(utc));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utc / 1000) * 1000;
}

function isValidZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    formatterFor(tz);
    return true;
  } catch {
    return false;
  }
}

/**
 * aviationstack returns airport-LOCAL wall-clock times but labels them with a
 * "+00:00" offset. We keep the wall clock for display and convert it to a real
 * UTC instant using the airport's IANA timezone.
 */
export function parseAirportTime(value: string | null, tz: string | null): TimePoint | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  let utc = wall;
  if (isValidZone(tz)) {
    const first = wall - tzOffset(tz, wall);
    utc = wall - tzOffset(tz, first); // second pass handles DST boundaries
  }
  return { local: `${y}-${mo}-${d}T${h}:${mi}`, utc };
}

/** Format a UTC instant as an airport-local wall-clock string (aviationstack style). */
export function toAirportWallClock(utc: number, tz: string): string {
  const shifted = utc + (isValidZone(tz) ? tzOffset(tz, utc) : 0);
  return new Date(shifted).toISOString().slice(0, 19) + "+00:00";
}

/* ---------------------------- display helpers --------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function clockOf(tp: TimePoint | null | undefined): string {
  return tp ? tp.local.slice(11, 16) : "--:--";
}

export function dayOf(tp: TimePoint | null | undefined): string {
  if (!tp) return "";
  const [, m, d] = tp.local.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const total = Math.round(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
