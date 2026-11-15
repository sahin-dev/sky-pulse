import { AlertTriangle, FlaskConical, Radio, SearchX } from "lucide-react";
import type { DataMode } from "@/lib/types";
import Link from "next/link";

/** Explains where the data on the page comes from (nothing shown for the full aviationstack mode). */
export function ModeBanner({ mode, notice }: { mode: DataMode; notice?: string | null }) {
  if (mode === "aviationstack") return null;
  if (mode === "demo") {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100/90">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber-300" />
        <p>
          <b className="font-semibold text-amber-200">Demo mode:</b> scheduled flights are simulated (aircraft positions from
          ADS-B are real). Remove <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">FLIGHT_DATA=demo</code> to
          use real data.
        </p>
      </div>
    );
  }
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/[0.05] px-4 py-3 text-sm text-sky-100/90">
      <Radio className="mt-0.5 size-4 shrink-0 text-sky-300" />
      <p>
        {notice && <b className="mb-1 block font-semibold text-amber-200">{notice}</b>}
        <b className="font-semibold text-sky-200">Free live data:</b> positions are real ADS-B reports (OpenSky, adsb.lol);
        routes come from an open callsign database and arrival times are estimates. Airline schedules, gates and official
        delays aren&apos;t available from free sources.
      </p>
    </div>
  );
}

export function ErrorPanel({ title = "Couldn't load flight data", message }: { title?: string; message: string }) {
  return (
    <div className="glass flex flex-col items-center rounded-3xl px-6 py-16 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-rose-400/10 text-rose-300 ring-1 ring-rose-400/20">
        <AlertTriangle className="size-6" />
      </div>
      <h3 className="font-display text-xl font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-400">{message}</p>
    </div>
  );
}

export function EmptyPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="glass flex flex-col items-center rounded-3xl px-6 py-16 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/20">
        <SearchX className="size-6" />
      </div>
      <h3 className="font-display text-xl font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-400">{message}</p>
      <Link href="/" className="mt-6 rounded-xl bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10">
        Back to search
      </Link>
    </div>
  );
}
