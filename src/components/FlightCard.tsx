"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Clock } from "lucide-react";
import { flightProgress, flightTimes } from "@/lib/geo";
import { flightHref } from "@/lib/search";
import { clockOf, dayOf, formatDuration } from "@/lib/time";
import type { Flight } from "@/lib/types";
import { AirlineBadge } from "./AirlineBadge";
import { ProgressTrack } from "./ProgressTrack";
import { StatusBadge } from "./StatusBadge";

export function FlightCard({ flight, now, index = 0 }: { flight: Flight; now: number; index?: number }) {
  const progress = flightProgress(flight, now);
  const t = flightTimes(flight);
  const delay = Math.max(flight.departure.delay ?? 0, flight.arrival.delay ?? 0);

  let caption = "";
  if (flight.status === "active" && t.arr) caption = `${formatDuration(t.arr - now)} remaining`;
  else if (flight.status === "scheduled" && t.dep) caption = t.dep > now ? `Departs in ${formatDuration(t.dep - now)}` : "Awaiting departure";
  else if (flight.status === "landed") caption = "Arrived";
  else if (t.dep && t.arr) caption = formatDuration(t.arr - t.dep);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.5, delay: Math.min(index, 12) * 0.05, ease: [0.2, 0.7, 0.2, 1] }}
      whileHover={{ y: -4 }}
    >
      <Link
        href={flightHref(flight)}
        className="glass group relative block overflow-hidden rounded-3xl p-5 transition-colors hover:border-sky-400/30"
      >
        <div className="pointer-events-none absolute -top-24 -right-24 size-48 rounded-full bg-sky-500/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <AirlineBadge code={flight.airline.iata} name={flight.airline.name} />
            <div className="min-w-0">
              <div className="font-mono text-lg font-semibold tracking-wide text-white">{flight.iata}</div>
              <div className="truncate text-sm text-slate-400">{flight.airline.name}</div>
            </div>
          </div>
          <StatusBadge status={flight.status} />
        </div>

        <div className="mt-6 grid grid-cols-[auto_1fr_auto] items-center gap-4">
          <div>
            <div className="font-display text-3xl font-semibold text-white">{flight.departure.iata}</div>
            <div className="max-w-24 truncate text-xs text-slate-400">{flight.departure.city}</div>
          </div>
          <div className="flex flex-col items-center">
            <ProgressTrack progress={progress} muted={flight.status === "cancelled"} />
            <div className="mt-1 text-[11px] text-slate-400">{caption}</div>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl font-semibold text-white">{flight.arrival.iata}</div>
            <div className="ml-auto max-w-24 truncate text-xs text-slate-400">{flight.arrival.city}</div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4 text-sm">
          <div>
            <span className="font-mono text-white">{clockOf(flight.departure.actual ?? flight.departure.estimated ?? flight.departure.scheduled)}</span>
            <span className="ml-2 text-xs text-slate-500">{dayOf(flight.departure.scheduled)}</span>
          </div>
          {delay > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-xs text-amber-300">
              <Clock className="size-3" /> +{delay}m
            </span>
          ) : (
            flight.inferred ? (
              <span
                className="text-xs text-slate-500"
                title="Free data: takeoff and arrival are estimated from the live position — no airline delay information."
              >
                est. times
              </span>
            ) : (
              <span className="text-xs text-emerald-300/80">On time</span>
            )
          )}
          <div className="text-right">
            <span className="font-mono text-white">{clockOf(flight.arrival.actual ?? flight.arrival.estimated ?? flight.arrival.scheduled)}</span>
            <span className="ml-2 text-xs text-slate-500">{dayOf(flight.arrival.scheduled)}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
