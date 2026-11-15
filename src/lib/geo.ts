import type { Flight } from "./types";

export type LatLon = [number, number];

const R = 6371; // km
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a: LatLon, b: LatLon): number {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x =
    Math.cos(rad(a[0])) * Math.sin(rad(b[0])) -
    Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Point a fraction `f` (0..1) of the way along the great circle from a to b. */
export function interpolate(a: LatLon, b: LatLon, f: number): LatLon {
  const φ1 = rad(a[0]), λ1 = rad(a[1]), φ2 = rad(b[0]), λ2 = rad(b[1]);
  const δ = distanceKm(a, b) / R;
  // Same point, or (near-)antipodal where the great circle is undefined and sin(δ) → 0 would give NaN.
  if (δ < 1e-9) return a;
  if (Math.abs(Math.sin(δ)) < 1e-9) return f < 0.5 ? a : b;
  const A = Math.sin((1 - f) * δ) / Math.sin(δ);
  const B = Math.sin(f * δ) / Math.sin(δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return [deg(Math.atan2(z, Math.hypot(x, y))), deg(Math.atan2(y, x))];
}

/**
 * Great-circle arc as a list of points with longitudes "unwrapped" so the line
 * never jumps across the antimeridian (Leaflet draws it continuously).
 */
export function greatCircle(a: LatLon, b: LatLon, segments = 128): LatLon[] {
  const pts: LatLon[] = [];
  let prevLon: number | null = null;
  for (let i = 0; i <= segments; i++) {
    const [lat, lon0] = interpolate(a, b, i / segments);
    let lon = lon0;
    if (prevLon !== null) {
      while (lon - prevLon > 180) lon -= 360;
      while (lon - prevLon < -180) lon += 360;
    }
    prevLon = lon;
    pts.push([lat, lon]);
  }
  return pts;
}

export function coordsOf(f: Flight): { dep: LatLon | null; arr: LatLon | null } {
  const d = f.departure, a = f.arrival;
  return {
    dep: d.lat != null && d.lon != null ? [d.lat, d.lon] : null,
    arr: a.lat != null && a.lon != null ? [a.lat, a.lon] : null,
  };
}

/** Best-known departure / arrival instants (UTC ms). */
export function flightTimes(f: Flight) {
  const dep = f.departure.actual ?? f.departure.estimated ?? f.departure.scheduled;
  const arr = f.arrival.actual ?? f.arrival.estimated ?? f.arrival.scheduled;
  return { dep: dep?.utc ?? null, arr: arr?.utc ?? null };
}

/** Point reached from `from` after travelling `distKm` on initial bearing `brg` (degrees). */
export function destinationPoint(from: LatLon, brg: number, distKm: number): LatLon {
  const δ = distKm / R;
  const θ = rad(brg);
  const φ1 = rad(from[0]);
  const λ1 = rad(from[1]);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [deg(φ2), ((deg(λ2) + 540) % 360) - 180];
}

/** A live fix older than this is ignored in favour of the schedule estimate. */
export const LIVE_STALE_MS = 20 * 60_000;
/** Never dead-reckon further than this past the last fix. */
const MAX_EXTRAPOLATE_MS = 10 * 60_000;

/** A live fix still usable at `now` (airborne, not stale, plausible numbers). */
function usableLive(f: Flight, now: number) {
  const l = f.live;
  if (!l || !Number.isFinite(l.lat) || !Number.isFinite(l.lon)) return null;
  if (now - l.updated > LIVE_STALE_MS) return null;
  return l;
}

/**
 * Dead reckoning: move a fix forward along its heading at its ground speed
 * (capped), so positions keep moving between data updates.
 */
export function extrapolate(
  fix: { lat: number; lon: number; heading: number | null; speed: number | null; updated: number; isGround?: boolean },
  now: number,
): LatLon {
  const age = Math.min(Math.max(0, now - fix.updated), MAX_EXTRAPOLATE_MS);
  if (fix.isGround || !fix.speed || fix.heading == null || age === 0) return [fix.lat, fix.lon];
  return destinationPoint([fix.lat, fix.lon], fix.heading, (fix.speed * age) / 3_600_000);
}

/** Progress 0..1 along the route. Prefers a live position, falls back to the schedule. */
export function flightProgress(f: Flight, now: number): number {
  if (f.status === "landed") return 1;
  if (f.status === "scheduled" || f.status === "cancelled") return 0;
  const { dep, arr } = coordsOf(f);
  const live = usableLive(f, now);
  if (live && dep && arr) {
    const p = live.isGround ? ([live.lat, live.lon] as LatLon) : extrapolate(live, now);
    const done = distanceKm(dep, p);
    const left = distanceKm(p, arr);
    if (done + left > 0) return clamp(done / (done + left));
  }
  const t = flightTimes(f);
  if (t.dep == null || t.arr == null || t.arr <= t.dep) return f.status === "active" ? 0.5 : 0;
  return clamp((now - t.dep) / (t.arr - t.dep));
}

export type PositionBasis = "adsb" | "airline" | "schedule";

export interface AircraftPosition {
  pos: LatLon;
  heading: number;
  /** True when not a fresh measurement (schedule-based, or extrapolated > 2 min). */
  estimated: boolean;
  basis: PositionBasis;
  /** Age of the underlying fix in ms (null for schedule estimates). */
  ageMs: number | null;
  provider: string | null;
}

/** Current aircraft position: live fix (dead-reckoned) when available, otherwise estimated from the schedule. */
export function aircraftPosition(f: Flight, now: number): AircraftPosition | null {
  const live = usableLive(f, now);
  if (live) {
    const ageMs = Math.max(0, now - live.updated);
    return {
      pos: extrapolate(live, now),
      heading: live.heading,
      estimated: ageMs > 120_000,
      basis: live.source,
      ageMs,
      provider: live.provider,
    };
  }
  const { dep, arr } = coordsOf(f);
  if (!dep || !arr) return null;
  const p = flightProgress(f, now);
  const pos = interpolate(dep, arr, p);
  const ahead = interpolate(dep, arr, Math.min(1, p + 0.01));
  const heading = p >= 0.99 ? bearing(interpolate(dep, arr, 0.98), arr) : bearing(pos, ahead);
  return { pos, heading, estimated: true, basis: "schedule", ageMs: null, provider: null };
}

/**
 * Rough position uncertainty in km, for drawing a halo: grows with fix age,
 * and is large for pure schedule estimates.
 */
export function positionUncertaintyKm(p: AircraftPosition): number {
  if (p.basis === "schedule") return 150;
  const minutes = (p.ageMs ?? 0) / 60_000;
  return Math.min(150, 0.5 + minutes * 4);
}

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
