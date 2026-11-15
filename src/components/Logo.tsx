export function PlaneGlyph({ className }: { className?: string }) {
  // Top-down airliner silhouette pointing north.
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 1.6c.85 0 1.45.75 1.45 1.6v5.55l7.75 4.6v2.05l-7.75-2.35v4.5l2.15 1.6v1.6L12 19.8l-3.6 1.15v-1.6l2.15-1.6v-4.5l-7.75 2.35v-2.05l7.75-4.6V3.2c0-.85.6-1.6 1.45-1.6z" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400 via-cyan-400 to-violet-500 shadow-[0_0_24px_rgb(56_189_248/0.45)]">
        <PlaneGlyph className="size-5 rotate-45 text-ink-950" />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-white">
        Sky<span className="text-gradient">Pulse</span>
      </span>
    </span>
  );
}
