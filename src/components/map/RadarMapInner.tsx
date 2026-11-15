"use client";

import "leaflet/dist/leaflet.css";
import { memo, useEffect, useMemo, useRef } from "react";
import { CircleMarker, Marker, Polyline, TileLayer, Tooltip, useMap, ZoomControl } from "react-leaflet";
import { SafeMapContainer } from "./SafeMapContainer";
import L from "leaflet";
import { altitudeColor, EMERGENCY_COLOR, flightLevel, isEmergency } from "@/lib/aircraft-style";
import { aircraftPosition, coordsOf, extrapolate, greatCircle, type LatLon } from "@/lib/geo";
import type { Flight, TrackPoint, Traffic } from "@/lib/types";
import {
  airportIcon,
  alignPoint,
  flyToBoundsSafe,
  planeIcon,
  TILE_ATTRIBUTION,
  TILE_MAX_NATIVE_ZOOM,
  TILE_URL,
} from "./leaflet-helpers";

/** Above this many ADS-B aircraft, draw them as canvas dots instead of DOM plane icons. */
const ICON_LIMIT = 450;

interface Props {
  flights: Flight[];
  traffic: Traffic[];
  now: number;
  selected: string | null;
  onSelect: (key: string | null) => void;
  selectedTraffic: string | null;
  onSelectTraffic: (hex: string | null) => void;
  /** Actual flown track of whichever aircraft is selected. */
  track: TrackPoint[] | null;
  onViewportChange?: (v: Viewport) => void;
}

const PlaneMarker = memo(function PlaneMarker({
  flight,
  pos,
  heading,
  selected,
  estimated,
  onSelect,
}: {
  flight: Flight;
  pos: LatLon;
  heading: number;
  selected: boolean;
  estimated: boolean;
  onSelect: (key: string) => void;
}) {
  // Schedule-estimated flights are drawn translucent so measured positions stand out.
  const icon = useMemo(
    () => planeIcon(heading, { size: selected ? 34 : 24, selected, opacity: estimated && !selected ? 0.55 : 1 }),
    [heading, selected, estimated],
  );
  return (
    <Marker position={pos} icon={icon} zIndexOffset={selected ? 1000 : 500} eventHandlers={{ click: () => onSelect(flight.key) }}>
      <Tooltip direction="top" offset={[0, -12]} className="sky-tooltip">
        <b className="font-mono">{flight.iata}</b> · {flight.departure.iata} → {flight.arrival.iata}
        {estimated ? " · est." : ""}
      </Tooltip>
    </Marker>
  );
});

function trafficTooltip(t: Traffic) {
  return (
    <>
      <b className="font-mono">{t.callsign ?? t.hex.toUpperCase()}</b>
      {t.airline ? ` · ${t.airline.name}` : ""} · {flightLevel(t.altitude, t.onGround)}
      {isEmergency(t.squawk) ? ` · SQUAWK ${t.squawk}` : ""}
    </>
  );
}

const TrafficIcon = memo(function TrafficIcon({
  t,
  pos,
  selected,
  onSelect,
}: {
  t: Traffic;
  pos: LatLon;
  selected: boolean;
  onSelect: (hex: string) => void;
}) {
  const heading = Math.round((t.track ?? 0) / 5) * 5;
  const color = isEmergency(t.squawk) ? EMERGENCY_COLOR : altitudeColor(t.altitude, t.onGround);
  const icon = useMemo(
    () => planeIcon(heading, { size: selected ? 30 : 18, selected, color, plain: !selected }),
    [heading, selected, color],
  );
  return (
    <Marker position={pos} icon={icon} zIndexOffset={selected ? 1000 : 0} eventHandlers={{ click: () => onSelect(t.hex) }}>
      <Tooltip direction="top" offset={[0, -10]} className="sky-tooltip">
        {trafficTooltip(t)}
      </Tooltip>
    </Marker>
  );
});

const TrafficDot = memo(function TrafficDot({
  t,
  pos,
  renderer,
  onSelect,
}: {
  t: Traffic;
  pos: LatLon;
  renderer: L.Renderer;
  onSelect: (hex: string) => void;
}) {
  const color = isEmergency(t.squawk) ? EMERGENCY_COLOR : altitudeColor(t.altitude, t.onGround);
  return (
    <CircleMarker
      center={pos}
      // `renderer` must be a constructor option (pathOptions only restyles) — it puts these on one shared canvas.
      renderer={renderer}
      radius={isEmergency(t.squawk) ? 5 : 2.6}
      pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 0 }}
      eventHandlers={{ click: () => onSelect(t.hex) }}
    >
      <Tooltip direction="top" offset={[0, -4]} className="sky-tooltip">
        {trafficTooltip(t)}
      </Tooltip>
    </CircleMarker>
  );
});

export interface Viewport {
  s: number;
  w: number;
  n: number;
  e: number;
  zoom: number;
}

/** Reports the visible area once the map is ready and after every pan / zoom. */
function ViewportWatcher({ onChange }: { onChange?: (v: Viewport) => void }) {
  const map = useMap();
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const emit = () => {
      const b = map.getBounds();
      cb.current?.({ s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast(), zoom: map.getZoom() });
    };
    map.whenReady(emit);
    map.on("moveend", emit);
    return () => {
      map.off("moveend", emit);
    };
  }, [map]);
  return null;
}

/**
 * Fly to a newly selected flight's route — once per selection. Area refetches
 * hand us fresh flight objects for the same flight; re-flying to where the map
 * already is would trip Leaflet's flyTo NaN bug.
 */
function FlyToSelection({ target, targetKey }: { target: L.LatLngBounds | null; targetKey: string | null }) {
  const map = useMap();
  const flownTo = useRef<string | null>(null);
  useEffect(() => {
    if (!target || !targetKey) {
      flownTo.current = null;
      return;
    }
    if (flownTo.current === targetKey) return;
    flownTo.current = targetKey;
    flyToBoundsSafe(map, target, { padding: 80, maxZoom: 5, duration: 1.2 });
  }, [map, target, targetKey]);
  return null;
}

export default function RadarMapInner({
  flights,
  traffic,
  now,
  selected,
  onSelect,
  selectedTraffic,
  onSelectTraffic,
  track,
  onViewportChange,
}: Props) {
  const positioned = useMemo(
    () =>
      flights
        .map((f) => {
          const ac = aircraftPosition(f, now);
          return ac ? { f, pos: ac.pos, heading: Math.round(ac.heading / 3) * 3, estimated: ac.basis === "schedule" } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x),
    [flights, now],
  );

  // ADS-B aircraft, dead-reckoned forward from their last report.
  const trafficPositioned = useMemo(
    () =>
      traffic.map((t) => ({
        t,
        pos: extrapolate({ lat: t.lat, lon: t.lon, heading: t.track, speed: t.speed, updated: t.updated, isGround: t.onGround }, now),
      })),
    [traffic, now],
  );
  const asIcons = traffic.length <= ICON_LIMIT;
  const canvas = useMemo(() => L.canvas({ padding: 0.3 }), []);

  const sel = flights.find((f) => f.key === selected) ?? null;
  const selRoute = useMemo(() => {
    if (!sel) return null;
    const { dep, arr } = coordsOf(sel);
    if (!dep || !arr) return null;
    const arc = greatCircle(dep, arr);
    return { arc, dep, arr: arc[arc.length - 1] };
  }, [sel]);
  const selPos = positioned.find((p) => p.f.key === selected);

  const split = useMemo(() => {
    if (!selRoute || !selPos) return null;
    const p = alignPoint(selPos.pos, selRoute.arc[Math.floor(selRoute.arc.length / 2)][1]);
    return { flown: greatCircle(selRoute.dep, p, 48), remaining: greatCircle(p, alignPoint(selRoute.arr, p[1]), 48) };
  }, [selRoute, selPos]);

  const trackLine = useMemo<LatLon[] | null>(() => {
    if (!track?.length) return null;
    const out: LatLon[] = [];
    let prev: number | null = null;
    for (const [lat, lon0] of track) {
      let lon = lon0;
      if (prev != null) {
        while (lon - prev > 180) lon -= 360;
        while (lon - prev < -180) lon += 360;
      }
      prev = lon;
      out.push([lat, lon]);
    }
    return out;
  }, [track]);

  const bounds = useMemo(() => (selRoute ? L.latLngBounds(selRoute.arc) : null), [selRoute]);
  const depIcon = useMemo(() => airportIcon("#38bdf8"), []);
  const arrIcon = useMemo(() => airportIcon("#a78bfa"), []);

  return (
    <SafeMapContainer
      center={[28, 10]}
      zoom={2}
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
    >
      <ZoomControl position="topright" />
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxNativeZoom={TILE_MAX_NATIVE_ZOOM} />
      <FlyToSelection target={bounds} targetKey={selRoute ? selected : null} />
      <ViewportWatcher onChange={onViewportChange} />

      {/* Other aircraft first, so scheduled flights draw on top. */}
      {trafficPositioned.map(({ t, pos }) =>
        asIcons || t.hex === selectedTraffic ? (
          <TrafficIcon key={t.hex} t={t} pos={pos} selected={t.hex === selectedTraffic} onSelect={onSelectTraffic} />
        ) : (
          <TrafficDot key={t.hex} t={t} pos={pos} renderer={canvas} onSelect={onSelectTraffic} />
        ),
      )}

      {trackLine && (
        <Polyline positions={trackLine} pathOptions={{ color: "#facc15", weight: 2.5, opacity: 0.9, className: "route-flown" }} />
      )}
      {split && (
        <>
          {!trackLine && <Polyline positions={split.flown} pathOptions={{ color: "#38bdf8", weight: 3, className: "route-flown" }} />}
          <Polyline positions={split.remaining} pathOptions={{ color: "#c4b5fd", weight: 2.5, className: "route-remaining" }} />
        </>
      )}
      {selRoute && (
        <>
          <Marker position={selRoute.dep} icon={depIcon}>
            <Tooltip permanent direction="top" offset={[0, -12]} className="sky-tooltip">
              <b className="font-mono">{sel!.departure.iata}</b>
            </Tooltip>
          </Marker>
          <Marker position={selRoute.arr} icon={arrIcon}>
            <Tooltip permanent direction="top" offset={[0, -12]} className="sky-tooltip">
              <b className="font-mono">{sel!.arrival.iata}</b>
            </Tooltip>
          </Marker>
        </>
      )}

      {positioned.map(({ f, pos, heading, estimated }) => (
        <PlaneMarker
          key={f.key}
          flight={f}
          pos={selected === f.key && split ? split.flown[split.flown.length - 1] : pos}
          heading={heading}
          selected={selected === f.key}
          estimated={estimated}
          onSelect={onSelect}
        />
      ))}
    </SafeMapContainer>
  );
}
