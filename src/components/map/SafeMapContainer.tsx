"use client";

import { createLeafletContext, LeafletContext, type LeafletContextInterface } from "@react-leaflet/core";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";

type Props = L.MapOptions & {
  center: L.LatLngExpression;
  zoom: number;
  className?: string;
  children?: React.ReactNode;
};

/**
 * Drop-in replacement for react-leaflet's <MapContainer>.
 *
 * React 19 dev (Strict Mode) and Next.js route preservation (<Activity>) run an
 * effect's cleanup and setup again on the *same* DOM node. react-leaflet's
 * MapContainer removes the Leaflet map in that cleanup but keeps handing the dead
 * map to its children, which then crash ("reading 'appendChild'", "_targets",
 * "Map container is being reused by another instance").
 *
 * Here the map lives as long as its container element is in the document: a
 * cleanup only schedules removal, and the removal is skipped if the element is
 * still connected (i.e. the effect is just being re-run, or the route is hidden).
 */
export function SafeMapContainer({ center, zoom, className, children, ...options }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [context, setContext] = useState<LeafletContextInterface | null>(null);
  // Capture the initial view/options once; later prop changes are handled by children (FitBounds etc.).
  const init = useRef({ center, zoom, options });

  useEffect(() => {
    const el = elRef.current!;
    let map = mapRef.current;
    if (!map) {
      map = new L.Map(el, init.current.options).setView(init.current.center, init.current.zoom);
      mapRef.current = map;
      setContext(createLeafletContext(map));
    }

    // Keep tiles correct when the container resizes or is revealed again after being hidden.
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(el);

    return () => {
      ro.disconnect();
      setTimeout(() => {
        if (!el.isConnected && mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      }, 0);
    };
  }, []);

  return (
    <div ref={elRef} className={className}>
      {context && <LeafletContext value={context}>{children}</LeafletContext>}
    </div>
  );
}
