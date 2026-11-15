"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Briefcase,
  CalendarDays,
  CloudSun,
  Check,
  DoorOpen,
  Gauge,
  Info,
  Mountain,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  RefreshCw,
  Ruler,
  Satellite,
  Timer,
  Warehouse,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { aircraftPosition, coordsOf, distanceKm, flightProgress, flightTimes } from "@/lib/geo";
import { flightHref } from "@/lib/search";
import { clockOf, dayOf, formatAgo, formatDuration } from "@/lib/time";
import type { AirportWeather, DataMode, Endpoint, Flight, LiveData, TrackPoint } from "@/lib/types";
import { useNow } from "@/lib/useNow";
import { AirlineBadge } from "./AirlineBadge";
import { AnimatedNumber } from "./AnimatedNumber";
import { RouteMap } from "./map";
import { ModeBanner } from "./Notices";
import { PositionBadge } from "./PositionBadge";
import { ProgressTrack } from "./ProgressTrack";
import { WeatherPanel } from "./WeatherPanel";
import { StatusBadge, delayTone } from "./StatusBadge";

const ease = [0.2, 0.7, 0.2, 1] as const;
const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease },
});

/** How often an airborne flight's ADS-B position is refreshed (free sources — no aviationstack quota). */
const LIVE_POLL_MS = 15_000;

export function FlightDetail({
  flight: serverFlight,
  track,
  weather,
  others,
  now: initialNow,
  mode,
  notice,
}: {
  flight: Flight;
  track: TrackPoint[] | null;
  weather?: { departure: AirportWeather | null; arrival: AirportWeather | null } | null;
  others: Flight[];
  now: number;
  mode: DataMode;
  notice?: string | null;
}) {
  const now = useNow(initialNow, 1000);
  const [polledLive, setPolledLive] = useState<LiveData | null>(null);

  // Keep an airborne aircraft's position fresh between (quota-costly) page refreshes.
  useEffect(() => {
    if (mode === "demo" || serverFlight.status !== "active") return;
    const hex = serverFlight.aircraft?.icao24?.toLowerCase();
    const callsign = serverFlight.callsign;
    if (!hex && !callsign) return;
    const qs = new URLSearchParams();
    if (hex && /^[0-9a-f]{6}$/.test(hex)) qs.set("hex", hex);
    if (callsign) qs.set("callsign", callsign);
    let stop = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/aircraft?${qs}`);
        const data = (await res.json()) as { live: LiveData | null };
        if (!stop && data.live) setPolledLive(data.live);
      } catch {
        /* keep the last known position */
      }
    };
    const id = setInterval(poll, LIVE_POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [serverFlight, mode]);

  const flight = useMemo<Flight>(
    () =>
      polledLive && (!serverFlight.live || polledLive.updated > serverFlight.live.updated)
        ? { ...serverFlight, live: polledLive }
        : serverFlight,
    [serverFlight, polledLive],
  );
  const position = flight.status === "active" ? aircraftPosition(flight, now) : null;
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [auto, setAuto] = useState(false);

  const refresh = () => startRefresh(() => router.refresh());

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") startRefresh(() => router.refresh());
    }, 120_000);
    return () => clearInterval(id);
  }, [auto, router]);

  const progress = flightProgress(flight, now);
  const times = flightTimes(flight);
  const { dep, arr } = coordsOf(flight);
  const totalKm = dep && arr ? distanceKm(dep, arr) : null;
  const duration = times.dep && times.arr ? times.arr - times.dep : null;

  let headline = "";
  if (flight.status === "active") headline = times.arr ? `${formatDuration(times.arr - now)} remaining` : "In the air";
  else if (flight.status === "scheduled")
    headline = times.dep && times.dep > now ? `Departs in ${formatDuration(times.dep - now)}` : "Awaiting departure";
  else if (flight.status === "landed") headline = times.arr ? `Landed ${formatAgo(now - times.arr)}` : "Landed";
  else if (flight.status === "cancelled") headline = "This flight was cancelled";
  else if (flight.status === "diverted") headline = "This flight was diverted";
  else if (flight.status === "unknown" && flight.inferred) headline = "Not airborne right now";

  return (
    <div className="space-y-6">
      <motion.div {...rise()} className="flex items-center justify-between gap-4">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white">
          <ArrowLeft className="size-4" /> Back
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAuto((a) => !a)}
            className={clsx(
              "rounded-xl px-3 py-2 text-xs transition",
              auto ? "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/30" : "bg-white/5 text-slate-400 hover:text-white",
            )}
            title="Refresh data every 2 minutes"
          >
            Auto-refresh {auto ? "on" : "off"}
          </button>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/10"
          >
            <RefreshCw className={clsx("size-3.5", refreshing && "animate-spin")} /> Refresh
          </button>
        </div>
      </motion.div>

      <ModeBanner mode={mode} notice={notice} />

      {/* ---------- Header ---------- */}
      <motion.section {...rise(0.05)} className="glass relative overflow-hidden rounded-[2rem] p-6 sm:p-8">
        <div className="pointer-events-none absolute -top-32 -right-20 size-80 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full bg-violet-500/15 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <AirlineBadge code={flight.airline.iata} name={flight.airline.name} size="lg" />
            <div>
              <h1 className="font-mono text-4xl font-semibold tracking-wider text-white sm:text-5xl">{flight.iata}</h1>
              <p className="mt-1 text-slate-400">
                {flight.airline.name}
                {flight.icao && <span className="text-slate-500"> · {flight.icao}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={flight.status} size="lg" />
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
              <CalendarDays className="size-3.5" /> {flight.date}
            </span>
          </div>
        </div>

        {flight.codeshare && (
          <p className="relative mt-4 inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
            <Info className="size-3.5 text-sky-300" />
            Codeshare — operated by {flight.codeshare.airline} as{" "}
            <Link href={`/flight/${flight.codeshare.flight}`} className="font-mono text-sky-300 hover:underline">
              {flight.codeshare.flight}
            </Link>
          </p>
        )}

        {flight.inferred && (
          <p className="relative mt-4 inline-flex max-w-full items-start gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
            <Info className="mt-0.5 size-3.5 shrink-0 text-sky-300" />
            <span>
              {flight.departure.lat != null
                ? <>Route inferred from the open callsign database for <b className="font-mono">{flight.callsign}</b>. </>
                : <>No route known for callsign <b className="font-mono">{flight.callsign}</b>. </>}
              {flight.live
                ? "Departure time is the observed takeoff; arrival is estimated from distance and ground speed."
                : "This aircraft isn't reporting a position right now — no schedule data is available in free mode."}
            </span>
          </p>
        )}

        {/* Route summary */}
        <div className="relative mt-10 grid grid-cols-[1fr_auto] gap-6 sm:grid-cols-[1fr_1.6fr_1fr] sm:items-center">
          <EndpointHead e={flight.departure} kind="dep" inferred={flight.inferred} />
          <div className="order-last col-span-2 sm:order-none sm:col-span-1">
            <ProgressTrack progress={progress} size="lg" muted={flight.status === "cancelled"} />
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>
                {totalKm ? `${Math.round(progress * totalKm).toLocaleString("en-US")} km flown` : ""}
              </span>
              <motion.span
                key={headline.split(" ")[0]}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-medium text-sky-200"
              >
                {headline}
              </motion.span>
              <span>{totalKm ? `${Math.round((1 - progress) * totalKm).toLocaleString("en-US")} km left` : ""}</span>
            </div>
          </div>
          <EndpointHead e={flight.arrival} kind="arr" inferred={flight.inferred} />
        </div>
      </motion.section>

      {/* ---------- Map ---------- */}
      <motion.section {...rise(0.12)} className="glass relative h-[420px] overflow-hidden rounded-[2rem] sm:h-[520px]">
        <RouteMap flight={flight} now={now} track={track} />
        <div className="pointer-events-none absolute top-4 left-4 z-[500] flex flex-wrap gap-2">
          {flight.status === "active" && (
            <span className="glass-strong flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-slate-200">
              <PositionBadge position={position} />
            </span>
          )}
          <span className="glass-strong flex items-center gap-3 rounded-full px-3 py-1.5 text-xs text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-sky-400" /> Flown
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded border-t-2 border-dotted border-violet-300" /> Remaining
            </span>
          </span>
        </div>
      </motion.section>

      {/* ---------- Detail cards ---------- */}
      <div className="grid gap-6 lg:grid-cols-3">
        <EndpointCard e={flight.departure} kind="dep" delay={0.18} inferred={flight.inferred} />
        <EndpointCard e={flight.arrival} kind="arr" delay={0.24} inferred={flight.inferred} />
        <TelemetryCard flight={flight} now={now} delay={0.3} />
      </div>

      {weather && (weather.departure || weather.arrival) && (
        <motion.section {...rise(0.32)} className="glass rounded-3xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle icon={CloudSun}>Airport weather</CardTitle>
            <span className="text-xs text-slate-500">METAR / TAF · aviationweather.gov</span>
          </div>
          <div className="mt-4">
            <WeatherPanel
              departure={{ iata: flight.departure.iata, city: flight.departure.city, weather: weather.departure }}
              arrival={{ iata: flight.arrival.iata, city: flight.arrival.city, weather: weather.arrival }}
              now={now}
            />
          </div>
        </motion.section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.section {...rise(0.34)} className="glass rounded-3xl p-6">
          <CardTitle icon={Plane}>Aircraft</CardTitle>
          <dl className="mt-4 space-y-3">
            <Row label="Type" value={flight.aircraft?.typeName ?? flight.aircraft?.type} />
            {flight.aircraft?.typeName && flight.aircraft.type && <Row label="Type code" value={flight.aircraft.type} mono />}
            <Row label="Registration" value={flight.aircraft?.registration} mono />
            {flight.aircraft?.operator && <Row label="Operator" value={flight.aircraft.operator} />}
            {flight.aircraft?.yearBuilt && (
              <Row
                label="Built"
                value={`${flight.aircraft.yearBuilt} · ${Math.max(0, new Date(now).getUTCFullYear() - flight.aircraft.yearBuilt)} years old`}
              />
            )}
            <Row label="ICAO 24-bit" value={flight.aircraft?.icao24?.toUpperCase()} mono />
            <Row label="Flight ICAO" value={flight.icao} mono />
          </dl>
        </motion.section>

        <motion.section {...rise(0.38)} className="glass rounded-3xl p-6">
          <CardTitle icon={Ruler}>Journey</CardTitle>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <BigStat label="Distance" value={totalKm} unit="km" />
            <BigStat label="Distance" value={totalKm ? totalKm / 1.852 : null} unit="nm" />
            <div className="col-span-2 rounded-2xl bg-white/[0.03] p-4">
              <div className="text-xs text-slate-400">Block time</div>
              <div className="mt-1 font-display text-2xl font-semibold text-white">{duration ? formatDuration(duration) : "—"}</div>
            </div>
          </div>
        </motion.section>

        <motion.section {...rise(0.42)} className="glass rounded-3xl p-6">
          <CardTitle icon={Timer}>Timeline</CardTitle>
          <Timeline flight={flight} />
        </motion.section>
      </div>

      {others.length > 0 && (
        <motion.section {...rise(0.46)} className="glass rounded-3xl p-6">
          <CardTitle icon={CalendarDays}>Other {flight.iata} flights</CardTitle>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {others.slice(0, 9).map((o) => (
              <Link
                key={o.key}
                href={flightHref(o)}
                className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3 text-sm transition hover:bg-white/[0.07]"
              >
                <span>
                  <span className="text-white">{o.date}</span>
                  <span className="ml-2 font-mono text-xs text-slate-400">
                    {o.departure.iata} → {o.arrival.iata}
                  </span>
                </span>
                <StatusBadge status={o.status} />
              </Link>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function EndpointHead({ e, kind, inferred }: { e: Endpoint; kind: "dep" | "arr"; inferred?: boolean }) {
  const best = e.actual ?? e.estimated ?? e.scheduled;
  const changed = e.scheduled && best && best.local !== e.scheduled.local;
  return (
    <div className={clsx(kind === "arr" && "text-right")}>
      <div className="flex items-center gap-2 text-xs tracking-widest text-slate-400 uppercase sm:inline-flex">
        {kind === "dep" ? <PlaneTakeoff className="size-3.5 text-sky-300" /> : <PlaneLanding className="size-3.5 text-violet-300" />}
        {kind === "dep" ? "From" : "To"}
      </div>
      <div className="mt-1 font-display text-5xl font-semibold tracking-tight text-white sm:text-6xl">{e.iata}</div>
      <div className="mt-1 truncate text-sm text-slate-300">{e.city}</div>
      <div className="mt-3 font-mono text-2xl text-white">
        {clockOf(best)}
        {changed && <span className="ml-2 text-sm text-slate-500 line-through">{clockOf(e.scheduled)}</span>}
      </div>
      <div className="text-xs text-slate-500">
        {best ? `${dayOf(best)} · local time` : inferred ? "time not available" : ""}
        {inferred && best && (e.actual ? " · observed" : " · estimated")}
      </div>
    </div>
  );
}

function EndpointCard({ e, kind, delay, inferred }: { e: Endpoint; kind: "dep" | "arr"; delay: number; inferred?: boolean }) {
  const Icon = kind === "dep" ? PlaneTakeoff : PlaneLanding;
  return (
    <motion.section {...rise(delay)} className="glass rounded-3xl p-6">
      <CardTitle icon={Icon} tone={kind === "dep" ? "sky" : "violet"}>
        {kind === "dep" ? "Departure" : "Arrival"}
      </CardTitle>
      <div className="mt-4">
        <div className="text-lg font-medium text-white">{e.name}</div>
        <div className="text-sm text-slate-400">
          {[e.city, e.country].filter(Boolean).join(", ")} · <span className="font-mono">{e.iata}</span>
          {e.icao && <span className="font-mono"> / {e.icao}</span>}
        </div>
      </div>

      {inferred ? (
        <dl className="mt-5 space-y-3">
          <Row
            label={kind === "dep" ? (e.actual ? "Takeoff (ADS-B)" : "Takeoff (estimated)") : "Estimated arrival"}
            value={(() => {
              const t = kind === "dep" ? (e.actual ?? e.estimated) : e.estimated;
              return t && `${clockOf(t)} · ${dayOf(t)}`;
            })()}
            mono
            highlight={kind === "dep" && !!e.actual}
          />
          <Row label="Time zone" value={e.timezone} />
          <p className="pt-1 text-xs text-slate-500">Terminal, gate and baggage need airline schedule data.</p>
        </dl>
      ) : (
        <>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <Chip icon={Warehouse} label="Terminal" value={e.terminal} />
        <Chip icon={DoorOpen} label="Gate" value={e.gate} />
        {kind === "arr" ? <Chip icon={Briefcase} label="Baggage" value={e.baggage} /> : <Chip icon={Timer} label="Delay" value={e.delay ? `${e.delay}m` : "0m"} tone={delayTone(e.delay)} />}
      </div>

      <dl className="mt-5 space-y-3">
        <Row label="Scheduled" value={e.scheduled && `${clockOf(e.scheduled)} · ${dayOf(e.scheduled)}`} mono />
        <Row label="Estimated" value={e.estimated && `${clockOf(e.estimated)} · ${dayOf(e.estimated)}`} mono />
        <Row label="Actual" value={e.actual && `${clockOf(e.actual)} · ${dayOf(e.actual)}`} mono highlight />
        {kind === "arr" && <Row label="Delay" value={e.delay ? `${e.delay} min` : "On time"} className={delayTone(e.delay)} />}
        <Row label="Time zone" value={e.timezone} />
      </dl>
        </>
      )}
    </motion.section>
  );
}

function TelemetryCard({ flight, now, delay }: { flight: Flight; now: number; delay: number }) {
  const live = flight.live;
  return (
    <motion.section {...rise(delay)} className="glass relative overflow-hidden rounded-3xl p-6">
      <CardTitle icon={Satellite}>Live telemetry</CardTitle>
      {live ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/[0.03] p-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Mountain className="size-3.5" /> Altitude
              </div>
              <div className="mt-1 font-display text-2xl font-semibold text-white">
                <AnimatedNumber value={live.altitude * 3.28084} /> <span className="text-sm text-slate-400">ft</span>
              </div>
              <div className="text-xs text-slate-500">{Math.round(live.altitude).toLocaleString("en-US")} m</div>
            </div>
            <div className="rounded-2xl bg-white/[0.03] p-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Gauge className="size-3.5" /> Ground speed
              </div>
              <div className="mt-1 font-display text-2xl font-semibold text-white">
                <AnimatedNumber value={live.speed / 1.852} /> <span className="text-sm text-slate-400">kt</span>
              </div>
              <div className="text-xs text-slate-500">{Math.round(live.speed).toLocaleString("en-US")} km/h</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 rounded-2xl bg-white/[0.03] p-4">
            <Compass heading={live.heading} />
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-slate-400">Heading </span>
                <span className="font-mono text-white">{Math.round(live.heading)}°</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-400">Vertical </span>
                {live.verticalSpeed > 0.5 ? (
                  <ArrowUpRight className="size-4 text-emerald-300" />
                ) : live.verticalSpeed < -0.5 ? (
                  <ArrowDownRight className="size-4 text-amber-300" />
                ) : null}
                <span className="font-mono text-white">{Math.round(live.verticalSpeed * 54.68).toLocaleString("en-US")} ft/min</span>
              </div>
              <div className="text-xs text-slate-500">
                {live.isGround ? "On ground" : "Airborne"} · {live.source === "adsb" ? `ADS-B via ${live.provider}` : "airline data"} ·
                updated {formatAgo(now - live.updated)}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-6 flex flex-col items-center rounded-2xl bg-white/[0.03] px-4 py-10 text-center">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 8, ease: "linear" }} className="mb-3 text-slate-500">
            <Satellite className="size-8" />
          </motion.div>
          <p className="text-sm text-slate-300">No live telemetry for this flight</p>
          <p className="mt-1 max-w-xs text-xs text-slate-500">
            {flight.status === "active"
              ? "The aircraft position on the map is estimated from the schedule."
              : "Live position data is available while the aircraft is airborne."}
          </p>
        </div>
      )}
    </motion.section>
  );
}

function Compass({ heading }: { heading: number }) {
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 100 100" className="absolute inset-0">
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="2" />
        {Array.from({ length: 36 }, (_, i) => (
          <line
            key={i}
            x1="50"
            y1="6"
            x2="50"
            y2={i % 9 === 0 ? 14 : 10}
            stroke={i % 9 === 0 ? "rgb(125 211 252 / 0.8)" : "rgb(255 255 255 / 0.25)"}
            strokeWidth={i % 9 === 0 ? 2 : 1}
            transform={`rotate(${i * 10} 50 50)`}
          />
        ))}
        {(["N", "E", "S", "W"] as const).map((d, i) => (
          <text
            key={d}
            x="50"
            y="26"
            textAnchor="middle"
            fontSize="9"
            fill={d === "N" ? "#7dd3fc" : "#94a3b8"}
            transform={`rotate(${i * 90} 50 50)`}
            fontFamily="var(--font-geist-mono)"
          >
            {d}
          </text>
        ))}
      </svg>
      <motion.div
        className="absolute inset-0 grid place-items-center"
        initial={{ rotate: 0 }}
        animate={{ rotate: heading }}
        transition={{ type: "spring", stiffness: 40, damping: 10 }}
      >
        <Plane className="size-7 -rotate-45 fill-sky-300 text-sky-300 drop-shadow-[0_0_8px_rgb(56_189_248/0.8)]" />
      </motion.div>
    </div>
  );
}

function Timeline({ flight }: { flight: Flight }) {
  const d = flight.departure, a = flight.arrival;
  const departed = !!d.actual || flight.status === "active" || flight.status === "landed";
  const landed = flight.status === "landed" || !!a.actual;
  const cancelled = flight.status === "cancelled";
  const steps = [
    ...(d.scheduled ? [{ label: "Scheduled departure", time: d.scheduled, done: true }] : []),
    { label: flight.inferred ? "Takeoff" : "Departed", time: d.actual ?? d.estimated, done: departed },
    {
      label: flight.status === "active" ? "In flight" : "En route",
      time: null,
      done: landed,
      current: flight.status === "active",
    },
    {
      label: cancelled ? "Cancelled" : flight.inferred && !landed ? "Arrival (estimated)" : "Arrival",
      time: a.actual ?? a.estimated ?? a.scheduled,
      done: landed,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <ol className="relative mt-5 space-y-5 pl-8">
      <span className="absolute top-2 bottom-2 left-[11px] w-px bg-white/10" />
      <motion.span
        className="absolute top-2 left-[11px] w-px bg-gradient-to-b from-sky-400 to-violet-400"
        initial={{ height: 0 }}
        animate={{ height: `${Math.max(0, ((doneCount - 1 + (flight.status === "active" ? 0.5 : 0)) / (steps.length - 1)) * 100)}%` }}
        transition={{ duration: 1.2, delay: 0.5, ease }}
      />
      {steps.map((s, i) => (
        <li key={i} className="relative">
          <span
            className={clsx(
              "absolute top-0.5 -left-8 grid size-6 place-items-center rounded-full ring-4 ring-ink-900",
              s.done ? "bg-gradient-to-br from-sky-400 to-violet-500 text-ink-950" : s.current ? "bg-sky-400/20 text-sky-300" : "bg-white/10 text-slate-500",
            )}
          >
            {s.done ? <Check className="size-3.5" strokeWidth={3} /> : s.current ? <span className="size-2 animate-ping rounded-full bg-sky-300" /> : <span className="size-1.5 rounded-full bg-current" />}
          </span>
          <div className={clsx("text-sm", s.done || s.current ? "text-white" : "text-slate-400")}>{s.label}</div>
          {s.time && (
            <div className="font-mono text-xs text-slate-500">
              {clockOf(s.time)} · {dayOf(s.time)}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------- primitives ------------------------------ */

function CardTitle({ icon: Icon, children, tone = "sky" }: { icon: typeof Plane; children: React.ReactNode; tone?: "sky" | "violet" }) {
  return (
    <h2 className="flex items-center gap-2.5 font-display text-base font-semibold text-white">
      <span
        className={clsx(
          "grid size-8 place-items-center rounded-xl ring-1 ring-white/10",
          tone === "sky" ? "bg-sky-400/10 text-sky-300" : "bg-violet-400/10 text-violet-300",
        )}
      >
        <Icon className="size-4" />
      </span>
      {children}
    </h2>
  );
}

function Row({
  label,
  value,
  mono,
  highlight,
  className,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] pb-3 text-sm last:border-0 last:pb-0">
      <dt className="text-slate-400">{label}</dt>
      <dd className={clsx(mono && "font-mono", value ? (highlight ? "text-emerald-300" : "text-white") : "text-slate-600", className)}>
        {value || "—"}
      </dd>
    </div>
  );
}

function Chip({ icon: Icon, label, value, tone }: { icon: typeof Plane; label: string; value: string | null; tone?: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] p-3 text-center">
      <Icon className="mx-auto size-4 text-slate-400" />
      <div className={clsx("mt-1.5 font-display text-xl font-semibold", value ? (tone ?? "text-white") : "text-slate-600")}>{value || "—"}</div>
      <div className="text-[10px] tracking-wider text-slate-500 uppercase">{label}</div>
    </div>
  );
}

function BigStat({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold text-white">
        {value != null ? <AnimatedNumber value={value} /> : "—"} <span className="text-sm text-slate-400">{unit}</span>
      </div>
    </div>
  );
}
