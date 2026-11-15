"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeftRight, ArrowRight, Building2, Plane, PlaneLanding, PlaneTakeoff, Route as RouteIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { AirportInput } from "./AirportInput";

type Mode = "flight" | "route" | "airport";

const TABS: { id: Mode; label: string; icon: typeof Plane }[] = [
  { id: "flight", label: "Flight", icon: Plane },
  { id: "route", label: "Route", icon: RouteIcon },
  { id: "airport", label: "Airport", icon: Building2 },
];

const SUGGESTIONS = [
  { label: "BA117", href: "/flight/BA117" },
  { label: "EK203", href: "/flight/EK203" },
  { label: "JFK → LHR", href: "/search?q=JFK-LHR" },
  { label: "Departures DXB", href: "/search?q=DXB" },
  { label: "Lufthansa", href: "/search?q=Lufthansa" },
];

export function SearchBox({ compact = false, initialMode = "flight" }: { compact?: boolean; initialMode?: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [flight, setFlight] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [airport, setAirport] = useState("");
  const [board, setBoard] = useState<"departures" | "arrivals">("departures");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isCode = (s: string) => /^[A-Za-z]{3}$/.test(s.trim());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let href: string | null = null;
    if (mode === "flight") {
      const code = flight.replace(/\s+/g, "").toUpperCase();
      if (!/^([A-Z0-9]{2}\d{1,4}[A-Z]?|[A-Z]{3}\d{1,4}[A-Z]{0,2})$/.test(code)) {
        setError("Enter a flight number like BA117 or EK203, or a callsign like BAW117.");
        return;
      }
      href = `/flight/${code}`;
    } else if (mode === "route") {
      if (!isCode(from) || !isCode(to)) {
        setError("Choose both airports (3-letter IATA codes, e.g. JFK and LHR).");
        return;
      }
      href = `/search?q=${from.trim().toUpperCase()}-${to.trim().toUpperCase()}`;
    } else {
      if (!isCode(airport)) {
        setError("Choose an airport (3-letter IATA code, e.g. DXB).");
        return;
      }
      href = `/search?q=${airport.trim().toUpperCase()}${board === "arrivals" ? "&mode=arrivals" : ""}`;
    }
    startTransition(() => router.push(href!));
  };

  return (
    <div className={clsx("w-full", compact ? "max-w-3xl" : "max-w-2xl")}>
      {/* Tabs */}
      <div className="mb-3 inline-flex rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1 backdrop-blur">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id);
              setError(null);
            }}
            className={clsx(
              "relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              mode === id ? "text-white" : "text-slate-400 hover:text-slate-200",
            )}
          >
            {mode === id && (
              <motion.span
                layoutId={`search-tab-${compact ? "c" : "h"}`}
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-sky-500/25 to-violet-500/25 ring-1 ring-white/10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            )}
            <Icon className="relative size-4" />
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="group relative">
        {/* animated gradient border */}
        <div className="absolute -inset-px rounded-[1.35rem] bg-gradient-to-r from-sky-400/50 via-violet-500/40 to-cyan-400/50 opacity-60 blur-[2px] transition-opacity duration-500 group-focus-within:opacity-100" />
        <div className="glass-strong relative flex flex-col gap-1 rounded-[1.3rem] p-1.5 sm:flex-row sm:items-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center"
            >
              {mode === "flight" && (
                <label className="flex flex-1 items-center gap-3 rounded-xl px-4 py-3">
                  <Plane className="size-5 text-sky-300" />
                  <span className="flex flex-1 flex-col">
                    <span className="text-[11px] font-medium tracking-wider text-slate-400 uppercase">Flight number</span>
                    <input
                      value={flight}
                      onChange={(e) => setFlight(e.target.value)}
                      placeholder="e.g. BA117, EK203, AA100"
                      className="w-full bg-transparent font-mono text-base font-medium tracking-wide text-white uppercase placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-500 placeholder:normal-case focus:outline-none"
                      autoComplete="off"
                    />
                  </span>
                </label>
              )}
              {mode === "route" && (
                <>
                  <AirportInput label="From" placeholder="City or airport" value={from} onChange={setFrom} icon={<PlaneTakeoff className="size-5" />} />
                  <button
                    type="button"
                    aria-label="Swap airports"
                    onClick={() => {
                      setFrom(to);
                      setTo(from);
                    }}
                    className="mx-auto grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:rotate-180 hover:text-white"
                  >
                    <ArrowLeftRight className="size-4" />
                  </button>
                  <AirportInput label="To" placeholder="City or airport" value={to} onChange={setTo} icon={<PlaneLanding className="size-5" />} />
                </>
              )}
              {mode === "airport" && (
                <>
                  <AirportInput label="Airport" placeholder="City or airport" value={airport} onChange={setAirport} />
                  <div className="mx-3 my-2 flex shrink-0 rounded-xl bg-white/5 p-1 text-xs sm:my-0">
                    {(["departures", "arrivals"] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBoard(b)}
                        className={clsx(
                          "rounded-lg px-3 py-1.5 capitalize transition-colors",
                          board === b ? "bg-white/10 text-white" : "text-slate-400 hover:text-white",
                        )}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          <motion.button
            type="submit"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            disabled={pending}
            className="relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-sky-400 to-violet-500 px-6 py-4 font-semibold text-ink-950 shadow-[0_8px_30px_rgb(56_189_248/0.35)] disabled:opacity-70"
          >
            <span>{pending ? "Tracking…" : "Track"}</span>
            <ArrowRight className={clsx("size-4 transition-transform", pending && "translate-x-1")} />
          </motion.button>
        </div>
      </form>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 text-sm text-rose-300"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {!compact && (
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Try</span>
          {SUGGESTIONS.map((s, i) => (
            <motion.button
              key={s.label}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 + i * 0.06 }}
              onClick={() => startTransition(() => router.push(s.href))}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-300 transition hover:border-sky-400/40 hover:bg-sky-400/10 hover:text-white"
            >
              {s.label}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
