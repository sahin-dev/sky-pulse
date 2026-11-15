"use client";

import dynamic from "next/dynamic";

function MapSkeleton() {
  return (
    <div className="relative size-full overflow-hidden bg-ink-900">
      <div className="skeleton absolute inset-0" />
      <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">Loading map…</div>
    </div>
  );
}

export const RouteMap = dynamic(() => import("./RouteMapInner"), { ssr: false, loading: MapSkeleton });
export const RadarMap = dynamic(() => import("./RadarMapInner"), { ssr: false, loading: MapSkeleton });
