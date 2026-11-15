"use client";

import { motion } from "motion/react";
import clsx from "clsx";
import { PlaneGlyph } from "./Logo";

/** Horizontal route line with an animated aircraft at the current progress. */
export function ProgressTrack({ progress, size = "md", muted = false }: { progress: number; size?: "md" | "lg"; muted?: boolean }) {
  const pct = Math.round(progress * 1000) / 10;
  const lg = size === "lg";
  return (
    <div className={clsx("relative w-full", lg ? "h-10" : "h-7")}>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-white/20" />
      <motion.div
        className={clsx(
          "absolute top-1/2 left-0 -translate-y-1/2 rounded-full",
          lg ? "h-[3px]" : "h-[2px]",
          muted ? "bg-slate-500" : "bg-gradient-to-r from-sky-400 via-cyan-300 to-violet-400 shadow-[0_0_12px_rgb(56_189_248/0.7)]",
        )}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1.4, ease: [0.2, 0.7, 0.2, 1] }}
      />
      <span className={clsx("absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400", lg ? "size-2.5" : "size-2")} />
      <span className={clsx("absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-violet-400 bg-ink-950", lg ? "size-3" : "size-2.5")} />
      <motion.div
        className="absolute top-1/2"
        initial={{ left: "0%" }}
        animate={{ left: `${pct}%` }}
        transition={{ duration: 1.4, ease: [0.2, 0.7, 0.2, 1] }}
        style={{ x: "-50%", y: "-50%" }}
      >
        <div className={clsx("relative grid place-items-center", lg ? "size-10" : "size-7")}>
          {!muted && progress > 0 && progress < 1 && (
            <span className="absolute inset-1 animate-ping rounded-full bg-sky-400/25" />
          )}
          <PlaneGlyph
            className={clsx(
              "relative rotate-90 drop-shadow-[0_0_8px_rgb(56_189_248/0.9)]",
              lg ? "size-7" : "size-5",
              muted ? "text-slate-400" : "text-white",
            )}
          />
        </div>
      </motion.div>
    </div>
  );
}
