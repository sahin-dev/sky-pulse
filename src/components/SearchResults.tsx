"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useMemo, useState } from "react";
import clsx from "clsx";
import type { Flight, FlightStatus } from "@/lib/types";
import { FlightCard } from "./FlightCard";

const FILTERS: { id: "all" | FlightStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "In flight" },
  { id: "scheduled", label: "Scheduled" },
  { id: "landed", label: "Landed" },
  { id: "cancelled", label: "Cancelled" },
];

export function SearchResults({ flights, now }: { flights: Flight[]; now: number }) {
  const [filter, setFilter] = useState<"all" | FlightStatus>("all");
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: flights.length };
    for (const f of flights) c[f.status] = (c[f.status] ?? 0) + 1;
    return c;
  }, [flights]);
  const shown = filter === "all" ? flights : flights.filter((f) => f.status === filter);

  return (
    <LayoutGroup>
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.filter((f) => f.id === "all" || counts[f.id]).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={clsx(
              "relative rounded-full px-4 py-1.5 text-sm transition-colors",
              filter === f.id ? "text-white" : "text-slate-400 hover:text-white",
            )}
          >
            {filter === f.id && (
              <motion.span layoutId="result-filter" className="absolute inset-0 rounded-full bg-white/10 ring-1 ring-white/15" />
            )}
            <span className="relative">
              {f.label} <span className="ml-1 text-xs text-slate-500">{counts[f.id] ?? 0}</span>
            </span>
          </button>
        ))}
      </div>
      <motion.div layout className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence>
          {shown.map((f, i) => (
            <FlightCard key={f.key} flight={f} now={now} index={i} />
          ))}
        </AnimatePresence>
      </motion.div>
    </LayoutGroup>
  );
}
