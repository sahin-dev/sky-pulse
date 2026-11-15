"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowUpRight,
  Gauge,
  Loader2,
  Mountain,
  MoveVertical,
  Navigation,
  Plane,
  Radar,
  Radio,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ALTITUDE_BANDS, altitudeColor, EMERGENCY_COLOR, EMERGENCY_SQUAWKS, flightLevel, GROUND_COLOR, isEmergency } from "@/lib/aircraft-style";
import { aircraftPosition, flightProgress } from "@/lib/geo";
import { flightHref } from "@/lib/search";
import type { AreaResult, Flight, PositionsMeta, TrackPoint, Traffic } from "@/lib/types";
import { useNow } from "@/lib/useNow";
import { AirlineBadge } from "./AirlineBadge";
import { RadarMap } from "./map";
import type { Viewport } from "./map/RadarMapInner";
import { PositionBadge } from "./PositionBadge";
import { ProgressTrack } from "./ProgressTrack";

/** Rendering hundreds of animated list rows is slow; the map shows everything anyway. */
const MAX_LIST_ROWS = 200;

type Tab = "flights" | "aircraft";

export function LiveRadar({ flights: initialFlights, now: initialNow }: { flights: Flight[]; now: number }) {
  const now = useNow(initialNow, 5000);
  const [flights, setFlights] = useState(initialFlights);
  const [traffic, setTraffic] = useState<Traffic[]>([]);
  const [positions, setPositions] = useState<PositionsMeta | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [selectedTraffic, setSelectedTraffic] = useState<Traffic | null>(null);
  const [track, setTrack] = useState<TrackPoint[] | null>(null);
  const [tab, setTab] = useState<Tab>("flights");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [regional, setRegional] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef<AbortController | null>(null);

  /** Load flights + ADS-B aircraft for whatever part of the map is visible (debounced, latest request wins). */
  const onViewportChange = useCallback((v: Viewport) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      inflight.current?.abort();
      const ctrl = new AbortController();
      inflight.current = ctrl;
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          s: Math.max(-90, v.s).toFixed(3),
          w: v.w.toFixed(3),
          n: Math.min(90, v.n).toFixed(3),
          e: v.e.toFixed(3),
        });
        const res = await fetch(`/api/flights/area?${qs}`, { signal: ctrl.signal });
        const data = (await res.json()) as AreaResult & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Couldn't load flights for this area.");
        setFlights(data.flights);
        setTraffic(data.traffic);
        setPositions(data.positions);
        setRegional(data.regional);
        setWarning(data.notice ? "aviationstack unavailable — showing free data" : data.warning);
      } catch (e) {
        if (!ctrl.signal.aborted) setWarning(e instanceof Error ? e.message : "Couldn't load flights for this area.");
      } finally {
        if (inflight.current === ctrl) setLoading(false);
      }
    }, 350);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      inflight.current?.abort();
    },
    [],
  );

  /* ------------------------------- selection ------------------------------ */

  const selected = selectedFlight?.key ?? null;
  const setSelected = useCallback(
    (key: string | null) => {
      setSelectedFlight(key ? (flights.find((f) => f.key === key) ?? null) : null);
      if (key) setSelectedTraffic(null);
    },
    [flights],
  );
  const selectTraffic = useCallback(
    (hex: string | null) => {
      setSelectedTraffic(hex ? (traffic.find((t) => t.hex === hex) ?? null) : null);
      if (hex) setSelectedFlight(null);
    },
    [traffic],
  );

  // Keep selections alive across refetches, but show their freshest data.
  const sel = flights.find((f) => f.key === selected) ?? selectedFlight;
  const selTraffic = (selectedTraffic && traffic.find((t) => t.hex === selectedTraffic.hex)) ?? selectedTraffic;

  // Actual flown track (OpenSky) for the selected aircraft.
  const trackHex = selTraffic?.hex ?? (sel?.live?.source === "adsb" ? sel.aircraft?.icao24?.toLowerCase() : null) ?? null;
  const trackDep = sel?.departure.actual?.utc ?? sel?.departure.scheduled?.utc ?? null;
  useEffect(() => {
    if (!trackHex) return;
    const ctrl = new AbortController();
    fetch(`/api/aircraft/track?hex=${trackHex}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: { track?: TrackPoint[] }) => {
        let t = d.track?.length ? d.track : null;
        // A track that began long before this flight departed belongs to an earlier leg.
        if (t && trackDep && t[0][3] < trackDep - 2 * 3600_000) t = null;
        setTrack(t);
      })
      .catch(() => {});
    return () => {
      ctrl.abort();
      setTrack(null);
    };
  }, [trackHex, trackDep]);

  /* ---------------------------------- lists --------------------------------- */

  const q = filter.trim().toLowerCase();
  const list = useMemo(() => {
    if (!q) return flights;
    return flights.filter((f) =>
      [f.iata, f.callsign, f.airline.name, f.departure.iata, f.arrival.iata, f.departure.city, f.arrival.city]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [flights, q]);
  const trafficList = useMemo(() => {
    if (!q) return traffic;
    return traffic.filter((t) =>
      [t.callsign, t.hex, t.airline?.name, t.registration, t.type, t.flightGuess, t.squawk].join(" ").toLowerCase().includes(q),
    );
  }, [traffic, q]);

  const mapFlights = useMemo(
    () => (sel && !list.some((f) => f.key === sel.key) ? [...list, sel] : list),
    [list, sel],
  );
  const mapTraffic = useMemo(
    () => (selTraffic && !trafficList.some((t) => t.hex === selTraffic.hex) ? [...trafficList, selTraffic] : trafficList),
    [trafficList, selTraffic],
  );

  const measured = flights.filter((f) => f.live?.source === "adsb").length;
  const emergencies = traffic.filter((t) => isEmergency(t.squawk));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Map */}
      <div className="glass relative h-[480px] overflow-hidden rounded-3xl sm:h-[640px]">
        <RadarMap
          flights={mapFlights}
          traffic={mapTraffic}
          now={now}
          selected={selected}
          onSelect={setSelected}
          selectedTraffic={selTraffic?.hex ?? null}
          onSelectTraffic={selectTraffic}
          track={track}
          onViewportChange={onViewportChange}
        />

        {/* overlay stats */}
        <div className="pointer-events-none absolute top-4 right-16 left-4 z-[500] flex flex-wrap gap-2">
          <span className="glass-strong flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-slate-200">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            {flights.length} flights · {traffic.length.toLocaleString("en-US")} other aircraft
          </span>
          <AnimatePresence>
            {loading && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="glass-strong flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-sky-200"
              >
                <Loader2 className="size-3.5 animate-spin" /> Scanning area…
              </motion.span>
            )}
          </AnimatePresence>
          {positions?.provider && (
            <span className="glass-strong flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-emerald-200">
              <Radio className="size-3.5" /> ADS-B via {positions.provider}
              {flights.length > 0 && <span className="text-slate-400">· {measured}/{flights.length} flights measured</span>}
            </span>
          )}
          {regional.length > 0 && (
            <span className="glass-strong hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-slate-300 sm:flex">
              <Radar className="size-3.5 text-violet-300" /> + departures from {regional.join(" · ")}
            </span>
          )}
          {emergencies.length > 0 && (
            <span className="glass-strong flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-rose-300">
              <AlertTriangle className="size-3.5" /> {emergencies.length} squawking emergency
            </span>
          )}
          {(warning || positions?.warning) && (
            <span className="glass-strong flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-amber-200">
              <AlertTriangle className="size-3.5" /> {warning ?? positions?.warning}
            </span>
          )}
          {positions?.creditsRemaining != null && positions.creditsRemaining < 50 && (
            <span className="glass-strong rounded-full px-3 py-1.5 text-xs text-amber-200">
              OpenSky credits low ({positions.creditsRemaining} left today)
            </span>
          )}
        </div>

        <AltitudeLegend />

        <AnimatePresence>
          {sel && (
            <motion.div
              key={sel.key}
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.96 }}
              transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
              className="glass-strong absolute right-4 bottom-4 left-4 z-[600] rounded-2xl p-4 shadow-2xl sm:right-auto sm:w-[380px]"
            >
              <CardHeader
                badge={<AirlineBadge code={sel.airline.iata} name={sel.airline.name} />}
                title={sel.iata}
                subtitle={`${sel.airline.name}${sel.callsign ? ` · ${sel.callsign}` : ""}`}
                onClose={() => setSelected(null)}
              />
              <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-3">
                <span className="font-display text-xl font-semibold">{sel.departure.iata}</span>
                <ProgressTrack progress={flightProgress(sel, now)} />
                <span className="font-display text-xl font-semibold">{sel.arrival.iata}</span>
              </div>
              {sel.live && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <Stat icon={Mountain} label="Altitude" value={`${Math.round(sel.live.altitude * 3.28084).toLocaleString("en-US")} ft`} />
                  <Stat icon={Gauge} label="Speed" value={`${Math.round(sel.live.speed / 1.852)} kt`} />
                  <Stat icon={Navigation} label="Heading" value={`${Math.round(sel.live.heading)}°`} />
                </div>
              )}
              <PositionBadge position={aircraftPosition(sel, now)} className="mt-3 text-xs" />
              <Link
                href={flightHref(sel)}
                className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-violet-500 py-2.5 text-sm font-semibold text-ink-950 transition hover:brightness-110"
              >
                Track this flight <ArrowUpRight className="size-4" />
              </Link>
            </motion.div>
          )}
          {selTraffic && !sel && <TrafficCard key={selTraffic.hex} t={selTraffic} now={now} onClose={() => selectTraffic(null)} />}
        </AnimatePresence>
      </div>

      {/* List */}
      <div className="glass flex h-[480px] flex-col overflow-hidden rounded-3xl sm:h-[640px]">
        <div className="space-y-2 border-b border-white/[0.06] p-3">
          <div className="grid grid-cols-2 rounded-xl bg-white/[0.04] p-1 text-sm">
            {(
              [
                ["flights", `Flights (${list.length})`],
                ["aircraft", `All aircraft (${trafficList.length.toLocaleString("en-US")})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={clsx(
                  "relative rounded-lg px-3 py-1.5 transition-colors",
                  tab === id ? "text-white" : "text-slate-400 hover:text-white",
                )}
              >
                {tab === id && <motion.span layoutId="radar-tab" className="absolute inset-0 rounded-lg bg-white/10" />}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5">
            <Search className="size-4 text-slate-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={tab === "flights" ? "Filter by flight, airline, airport…" : "Filter by callsign, airline, type, reg…"}
              className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
          </label>
        </div>

        <ul className="flex-1 space-y-1 overflow-y-auto p-2">
          {tab === "flights" &&
            list.slice(0, MAX_LIST_ROWS).map((f, i) => {
              const pos = aircraftPosition(f, now);
              return (
                <motion.li
                  key={f.key}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i, 15) * 0.03 }}
                >
                  <button
                    onClick={() => setSelected(f.key === selected ? null : f.key)}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors",
                      f.key === selected ? "bg-sky-400/10 ring-1 ring-sky-400/30" : "hover:bg-white/[0.04]",
                    )}
                  >
                    <AirlineBadge code={f.airline.iata} name={f.airline.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-white">{f.iata}</span>
                        <span
                          className={clsx(
                            "font-mono text-[11px]",
                            pos?.basis === "adsb" ? "text-emerald-300" : pos?.basis === "airline" ? "text-sky-300" : "text-slate-500",
                          )}
                          title={pos ? (pos.basis === "schedule" ? "Estimated from schedule" : `Measured (${pos.provider})`) : ""}
                        >
                          {f.live ? flightLevel(f.live.altitude, f.live.isGround) : "est."}
                          {pos?.basis === "adsb" && " ●"}
                        </span>
                      </div>
                      <div className="truncate text-xs text-slate-400">
                        {f.departure.iata} → {f.arrival.iata} · {f.airline.name}
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-400"
                          style={{ width: `${Math.round(flightProgress(f, now) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </button>
                </motion.li>
              );
            })}

          {tab === "aircraft" &&
            trafficList.slice(0, MAX_LIST_ROWS).map((t) => (
              <li key={t.hex}>
                <button
                  onClick={() => selectTraffic(t.hex === selTraffic?.hex ? null : t.hex)}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                    t.hex === selTraffic?.hex ? "bg-sky-400/10 ring-1 ring-sky-400/30" : "hover:bg-white/[0.04]",
                  )}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: isEmergency(t.squawk) ? EMERGENCY_COLOR : altitudeColor(t.altitude, t.onGround) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-white">{t.callsign ?? t.hex.toUpperCase()}</span>
                      <span className="font-mono text-[11px] text-slate-400">{flightLevel(t.altitude, t.onGround)}</span>
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {[t.airline?.name, t.type, t.registration ?? t.originCountry].filter(Boolean).join(" · ") || "Unidentified"}
                    </div>
                  </div>
                </button>
              </li>
            ))}

          {tab === "flights" && !list.length && (
            <li className="p-6 text-center text-sm text-slate-500">
              {filter
                ? `No flights match “${filter}”.`
                : "No scheduled flights here right now. Check “All aircraft”, or zoom out and pan."}
            </li>
          )}
          {tab === "aircraft" && !trafficList.length && (
            <li className="p-6 text-center text-sm text-slate-500">
              {filter ? `No aircraft match “${filter}”.` : "No ADS-B aircraft reported in this area."}
            </li>
          )}
          {(tab === "flights" ? list.length : trafficList.length) > MAX_LIST_ROWS && (
            <li className="p-3 text-center text-xs text-slate-500">
              Showing {MAX_LIST_ROWS} of {(tab === "flights" ? list.length : trafficList.length).toLocaleString("en-US")} — zoom in
              or filter to narrow down.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------- */

function TrafficCard({ t, now, onClose }: { t: Traffic; now: number; onClose: () => void }) {
  const emergency = isEmergency(t.squawk);
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.96 }}
      transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
      className="glass-strong absolute right-4 bottom-4 left-4 z-[600] rounded-2xl p-4 shadow-2xl sm:right-auto sm:w-[380px]"
    >
      <CardHeader
        badge={
          t.airline?.iata ? (
            <AirlineBadge code={t.airline.iata} name={t.airline.name} />
          ) : (
            <span className="grid size-10 place-items-center rounded-xl bg-white/5 text-slate-400 ring-1 ring-white/10">
              <Plane className="size-4" />
            </span>
          )
        }
        title={t.callsign ?? t.hex.toUpperCase()}
        subtitle={t.airline?.name ?? t.originCountry ?? "Unidentified aircraft"}
        onClose={onClose}
      />
      {emergency && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-500/15 px-3 py-2 text-xs text-rose-200 ring-1 ring-rose-400/30">
          <AlertTriangle className="size-4" /> Squawk {t.squawk}: {EMERGENCY_SQUAWKS[t.squawk!]}
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <Stat icon={Mountain} label="Altitude" value={t.onGround ? "Ground" : t.altitude != null ? `${Math.round(t.altitude * 3.28084).toLocaleString("en-US")} ft` : "—"} />
        <Stat icon={Gauge} label="Speed" value={t.speed != null ? `${Math.round(t.speed / 1.852)} kt` : "—"} />
        <Stat icon={Navigation} label="Track" value={t.track != null ? `${Math.round(t.track)}°` : "—"} />
        <Stat icon={MoveVertical} label="Vertical" value={t.verticalRate != null ? `${Math.round(t.verticalRate * 54.68).toLocaleString("en-US")} fpm` : "—"} />
        <Stat icon={Radio} label="Squawk" value={t.squawk ?? "—"} />
        <Stat icon={Plane} label={t.registration ? "Type · Reg" : "ICAO hex"} value={t.registration ? `${t.type ?? "?"} · ${t.registration}` : t.hex.toUpperCase()} />
      </div>
      <PositionBadge position={{ basis: "adsb", ageMs: Math.max(0, now - t.updated), provider: t.provider }} className="mt-3 text-xs" />
      {t.callsign && /^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/.test(t.callsign) ? (
        <Link
          href={`/flight/${t.callsign}?hex=${t.hex}`}
          className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-400 to-violet-500 py-2.5 text-sm font-semibold text-ink-950 transition hover:brightness-110"
          title={t.flightGuess ? `Probably flight ${t.flightGuess} (guessed from the callsign).` : undefined}
        >
          Track {t.callsign}
          {t.flightGuess ? ` · ${t.flightGuess}` : ""} <ArrowUpRight className="size-4" />
        </Link>
      ) : (
        <p className="mt-3 text-center text-xs text-slate-500">No scheduled-flight data matched this aircraft.</p>
      )}
    </motion.div>
  );
}

function CardHeader({
  badge,
  title,
  subtitle,
  onClose,
}: {
  badge: React.ReactNode;
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {badge}
        <div className="min-w-0">
          <div className="font-mono font-semibold text-white">{title}</div>
          <div className="truncate text-xs text-slate-400">{subtitle}</div>
        </div>
      </div>
      <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white">
        <X className="size-4" />
      </button>
    </div>
  );
}

function AltitudeLegend() {
  return (
    <div className="glass-strong pointer-events-none absolute right-3 bottom-7 z-[500] hidden rounded-xl px-3 py-2 text-[10px] text-slate-300 md:block">
      <div className="mb-1.5 font-medium tracking-wider text-slate-400 uppercase">Altitude</div>
      <div className="flex items-center gap-2.5">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full" style={{ background: GROUND_COLOR }} /> GND
        </span>
        {ALTITUDE_BANDS.map((b) => (
          <span key={b.label} className="flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ background: b.color }} /> {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-2 py-2">
      <Icon className="mx-auto mb-1 size-3.5 text-sky-300" />
      <div className="truncate font-mono text-white">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}
