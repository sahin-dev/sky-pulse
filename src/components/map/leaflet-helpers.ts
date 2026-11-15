import L from "leaflet";
import type { LatLon } from "@/lib/geo";

/** Esri "Dark Gray Canvas" basemap — free to use with attribution, no API key needed. */
export const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
export const TILE_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const TILE_MAX_NATIVE_ZOOM = 16;

const PLANE_PATH =
  "M12 1.6c.85 0 1.45.75 1.45 1.6v5.55l7.75 4.6v2.05l-7.75-2.35v4.5l2.15 1.6v1.6L12 19.8l-3.6 1.15v-1.6l2.15-1.6v-4.5l-7.75 2.35v-2.05l7.75-4.6V3.2c0-.85.6-1.6 1.45-1.6z";

export function planeIcon(
  heading: number,
  opts: { size?: number; selected?: boolean; halo?: boolean; color?: string; opacity?: number; plain?: boolean } = {},
) {
  const size = opts.size ?? 30;
  const color = opts.selected ? "#facc15" : (opts.color ?? "#7dd3fc");
  return L.divIcon({
    className: `plane-marker${opts.selected ? " selected" : ""}${opts.plain ? " plain" : ""}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="position:relative;width:${size}px;height:${size}px;opacity:${opts.opacity ?? 1}">
      ${opts.halo ? '<span class="halo"></span>' : ""}
      <svg class="plane" viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${Math.round(heading)}deg)">
        <path d="${PLANE_PATH}" fill="${color}" stroke="#03050d" stroke-width="0.6"/>
      </svg>
    </div>`,
  });
}

export function airportIcon(color: string) {
  return L.divIcon({
    className: "airport-marker",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="--c:${color};position:relative;width:22px;height:22px"><span class="ring"></span><span class="dot"></span></div>`,
  });
}

const finite = (...n: number[]) => n.every(Number.isFinite);

/**
 * Where a "fit these bounds" move would end up, or null if it can't be computed
 * safely: invalid bounds, or a map that is hidden / smaller than its padding
 * (Leaflet would then return a NaN zoom and crash with "Invalid LatLng (NaN, NaN)").
 */
function boundsTarget(map: L.Map, bounds: L.LatLngBounds, padding: number, maxZoom: number) {
  if (!bounds.isValid()) return null;
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  if (!finite(sw.lat, sw.lng, ne.lat, ne.lng)) return null;
  const size = map.getSize();
  const pad = size.x > padding * 4 && size.y > padding * 4 ? padding : 0;
  if (size.x <= 0 || size.y <= 0) return null;
  const zoom = Math.min(map.getBoundsZoom(bounds, false, L.point(pad * 2, pad * 2)), maxZoom);
  const center = bounds.getCenter();
  if (!finite(zoom, center.lat, center.lng)) return null;
  return { center, zoom };
}

/** fitBounds that never throws; returns false when the map isn't ready (e.g. zero size). */
export function fitBoundsSafe(map: L.Map, bounds: L.LatLngBounds, opts: { padding: number; maxZoom: number }): boolean {
  const t = boundsTarget(map, bounds, opts.padding, opts.maxZoom);
  if (!t) return false;
  map.setView(t.center, t.zoom, { animate: false });
  return true;
}

/**
 * Animated flyToBounds without Leaflet's NaN failure modes. flyTo divides by the
 * on-screen distance it travels, so flying to the current centre yields NaN; in
 * that case (or for tiny moves) it zooms in place instead.
 */
export function flyToBoundsSafe(
  map: L.Map,
  bounds: L.LatLngBounds,
  opts: { padding: number; maxZoom: number; duration: number },
): void {
  const t = boundsTarget(map, bounds, opts.padding, opts.maxZoom);
  if (!t) return;
  const zoomNow = map.getZoom();
  const pixelsAway = map.project(map.getCenter(), zoomNow).distanceTo(map.project(t.center, zoomNow));
  if (pixelsAway < 2) {
    if (Math.abs(zoomNow - t.zoom) > 0.01) map.setZoom(t.zoom);
    return;
  }
  try {
    map.flyTo(t.center, t.zoom, { duration: opts.duration });
  } catch {
    map.setView(t.center, t.zoom, { animate: false });
  }
}

/** Shift a longitude by ±360 so it sits next to a reference longitude (for unwrapped arcs). */
export function alignLon(lon: number, ref: number) {
  while (lon - ref > 180) lon -= 360;
  while (lon - ref < -180) lon += 360;
  return lon;
}

export function alignPoint(p: LatLon, ref: number): LatLon {
  return [p[0], alignLon(p[1], ref)];
}
