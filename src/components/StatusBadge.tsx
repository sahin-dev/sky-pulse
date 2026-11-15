import clsx from "clsx";
import type { FlightStatus } from "@/lib/types";

const STYLES: Record<FlightStatus, { label: string; cls: string; dot: string }> = {
  active: { label: "In flight", cls: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30", dot: "bg-emerald-400" },
  scheduled: { label: "Scheduled", cls: "bg-sky-400/10 text-sky-300 ring-sky-400/30", dot: "bg-sky-400" },
  landed: { label: "Landed", cls: "bg-violet-400/10 text-violet-300 ring-violet-400/30", dot: "bg-violet-400" },
  cancelled: { label: "Cancelled", cls: "bg-rose-400/10 text-rose-300 ring-rose-400/30", dot: "bg-rose-400" },
  incident: { label: "Incident", cls: "bg-rose-400/10 text-rose-300 ring-rose-400/30", dot: "bg-rose-400" },
  diverted: { label: "Diverted", cls: "bg-amber-400/10 text-amber-300 ring-amber-400/30", dot: "bg-amber-400" },
  unknown: { label: "No live data", cls: "bg-slate-400/10 text-slate-300 ring-slate-400/30", dot: "bg-slate-400" },
};

export function StatusBadge({ status, size = "sm" }: { status: FlightStatus; size?: "sm" | "lg" }) {
  const s = STYLES[status] ?? STYLES.unknown;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset",
        s.cls,
        size === "lg" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-1 text-xs",
      )}
    >
      <span className="relative flex size-1.5">
        {status === "active" && <span className={clsx("absolute inline-flex size-full animate-ping rounded-full opacity-75", s.dot)} />}
        <span className={clsx("relative inline-flex size-1.5 rounded-full", s.dot)} />
      </span>
      {s.label}
    </span>
  );
}

export function delayTone(delay: number | null | undefined) {
  if (!delay) return "text-emerald-300";
  if (delay < 15) return "text-amber-300";
  return "text-rose-300";
}
