"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import { Circle, Marker, Polyline, TileLayer, Tooltip, useMap, ZoomControl } from "react-leaflet";
import { SafeMapContainer } from "./SafeMapContainer";
import L from "leaflet";
import { aircraftPosition, coordsOf, greatCircle, positionUncertaintyKm, type LatLon } from "@/lib/geo";
import type { Flight, TrackPoint } from "@/lib/types";
import {
  airportIcon,
  alignPoint,
  fitBoundsSafe,
  planeIcon,
  TILE_ATTRIBUTION,
  TILE_MAX_NATIVE_ZOOM,
  TILE_URL,
} from "./leaflet-helpers";

function FitBounds({ points }: { points: LatLon[] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length < 2) return;
    const bounds = L.latLngBounds(points);
    // The map can still be zero-sized (hidden / not laid out yet); retry once it has a size.
    const attempt = () => {
      if (!done.current && fitBoundsSafe(map, bounds, { padding: 60, maxZoom: 7 })) done.current = true;
    };
    attempt();
    if (done.current) return;
    map.on("resize", attempt);
    return () => {
      map.off("resize", attempt);
    };
  }, [map, points]);
  return null;
}

/** Unwrap longitudes so a track crossing the antimeridian draws as one continuous line near `refLon`. */
function unwrapTrack(track: TrackPoint[], refLon: number): LatLon[] {
  const out: LatLon[] = [];
  let prev: number | null = null;
  for (const [lat, lon0] of track) {
    let lon = lon0;
    const ref = prev ?? refLon;
    while (lon - ref > 180) lon -= 360;
    while (lon - ref < -180) lon += 360;
    prev = lon;
    out.push([lat, lon]);
  }
  return out;
}

export default function RouteMapInner({ flight, now, track }: { flight: Flight; now: number; track?: TrackPoint[] | null }) {
  const { dep, arr } = coordsOf(flight);
  const arc = useMemo(() => (dep && arr ? greatCircle(dep, arr) : []), [dep?.[0], dep?.[1], arr?.[0], arr?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const ac = flight.status === "active" ? aircraftPosition(flight, now) : null;
  const haloKm = ac?.estimated ? positionUncertaintyKm(ac) : 0;
  const refLon = arc.length ? arc[Math.floor(arc.length / 2)][1] : 0;
  const planePos = ac ? alignPoint(ac.pos, refLon) : null;
  const heading = ac ? Math.round(ac.heading) : 0;
  const icon = useMemo(() => planeIcon(heading, { size: 38, halo: true }), [heading]);
  const depIcon = useMemo(() => airportIcon("#38bdf8"), []);
  const arrIcon = useMemo(() => airportIcon("#a78bfa"), []);

  // Split the route around the aircraft (or at the ends if not airborne).
  const { flown, remaining } = useMemo(() => {
    if (!arc.length) return { flown: [] as LatLon[], remaining: [] as LatLon[] };
    if (flight.status === "landed") return { flown: arc, remaining: [] };
    if (!planePos || !dep || !arr) return { flown: [], remaining: arc };
    const to = alignPoint(arr, planePos[1]);
    // Prefer the real flown track (ADS-B history) over an idealised great circle.
    const a = track?.length ? [...unwrapTrack(track, arc[0][1]), planePos] : greatCircle(dep, planePos, 64);
    const b = greatCircle(planePos, to, 64);
    return { flown: a, remaining: b };
  }, [arc, flight.status, planePos?.[0], planePos?.[1], track]); // eslint-disable-line react-hooks/exhaustive-deps


  const center: LatLon = planePos ?? (arc.length ? arc[Math.floor(arc.length / 2)] : [20, 0]);
  const arrPos = arr && arc.length ? arc[arc.length - 1] : arr;

  return (
    <SafeMapContainer
      center={center}
      zoom={3}
      minZoom={2}
      zoomSnap={0.25}
      worldCopyJump
      maxZoom={12}
      scrollWheelZoom
      wheelPxPerZoomLevel={100}
      wheelDebounceTime={30}
      doubleClickZoom
      boxZoom
      className="size-full"
      zoomControl={false}
      attributionControl
    >
      <ZoomControl position="topright" />
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxNativeZoom={TILE_MAX_NATIVE_ZOOM} />
      <FitBounds points={arc.length ? arc : planePos ? [planePos] : []} />

      {/* soft glow under the full path */}
      {arc.length > 0 && <Polyline positions={arc} pathOptions={{ color: "#38bdf8", weight: 10, opacity: 0.06 }} />}
      {flown.length > 0 && (
        <Polyline positions={flown} pathOptions={{ color: "#38bdf8", weight: 3.5, opacity: 0.95, className: "route-flown" }} />
      )}
      {remaining.length > 0 && (
        <Polyline
          positions={remaining}
          pathOptions={{ color: "#c4b5fd", weight: 2.5, opacity: 0.85, lineCap: "round", className: "route-remaining" }}
        />
      )}

      {dep && (
        <Marker position={dep} icon={depIcon}>
          <Tooltip permanent direction="top" offset={[0, -12]} className="sky-tooltip">
            <b className="font-mono">{flight.departure.iata}</b> · {flight.departure.city}
          </Tooltip>
        </Marker>
      )}
      {arrPos && (
        <Marker position={arrPos} icon={arrIcon}>
          <Tooltip permanent direction="top" offset={[0, -12]} className="sky-tooltip">
            <b className="font-mono">{flight.arrival.iata}</b> · {flight.arrival.city}
          </Tooltip>
        </Marker>
      )}
      {planePos && haloKm > 1 && (
        <Circle
          center={planePos}
          radius={haloKm * 1000}
          pathOptions={{ color: ac?.basis === "schedule" ? "#fbbf24" : "#7dd3fc", weight: 1, opacity: 0.6, dashArray: "4 6", fillOpacity: 0.06 }}
        />
      )}
      {planePos && <Marker position={planePos} icon={icon} zIndexOffset={1000} />}
    </SafeMapContainer>
  );
}
