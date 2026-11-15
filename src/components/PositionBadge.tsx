import { CalendarClock, Radio, Satellite } from "lucide-react";
import clsx from "clsx";
import type { AircraftPosition } from "@/lib/geo";
import { formatAgo } from "@/lib/time";

/**
 * Where a plane's position comes from and how fresh it is:
 *   ADS-B (measured, seconds old) › airline data (minutes old) › schedule estimate.
 */
export function positionLabel(p: Pick<AircraftPosition, "basis" | "ageMs" | "provider">) {
  if (p.basis === "adsb") return `Live ADS-B · ${p.provider ?? ""} · ${formatAgo(p.ageMs ?? 0)}`.replace(" ·  ·", " ·");
  if (p.basis === "airline") return `Airline position · ${formatAgo(p.ageMs ?? 0)}`;
  return "Estimated from schedule";
}

export function PositionBadge({
  position,
  className,
}: {
  position: Pick<AircraftPosition, "basis" | "ageMs" | "provider"> | null;
  className?: string;
}) {
  if (!position) return null;
  const { basis } = position;
  const Icon = basis === "adsb" ? Radio : basis === "airline" ? Satellite : CalendarClock;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5",
        basis === "adsb" ? "text-emerald-300" : basis === "airline" ? "text-sky-300" : "text-amber-300",
        className,
      )}
      title={
        basis === "adsb"
          ? "Measured by ADS-B receivers; moved forward along its heading since the last report."
          : basis === "airline"
            ? "Position reported by aviationstack; may be several minutes old."
            : "No live data — position estimated from departure/arrival times along the great-circle route."
      }
    >
      <Icon className="size-3.5" />
      {positionLabel(position)}
    </span>
  );
}
