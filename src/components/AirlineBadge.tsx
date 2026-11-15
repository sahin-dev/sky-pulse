import clsx from "clsx";

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Monogram badge with a stable per-airline gradient. */
export function AirlineBadge({ code, name, size = "md" }: { code: string; name: string; size?: "md" | "lg" }) {
  const h = hue(code || name);
  return (
    <span
      title={name}
      className={clsx(
        "grid shrink-0 place-items-center rounded-xl font-mono font-bold text-white ring-1 ring-white/15",
        size === "lg" ? "size-14 text-lg" : "size-10 text-sm",
      )}
      style={{
        background: `linear-gradient(135deg, hsl(${h} 80% 55% / 0.9), hsl(${(h + 50) % 360} 70% 35% / 0.9))`,
        boxShadow: `0 6px 24px hsl(${h} 80% 50% / 0.3)`,
      }}
    >
      {(code || name.slice(0, 2)).toUpperCase()}
    </span>
  );
}
