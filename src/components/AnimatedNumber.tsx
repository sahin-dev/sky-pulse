"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect } from "react";

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Number that springs to its new value whenever it changes. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => fmt.format(Math.round(v)));
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.2, ease: [0.2, 0.7, 0.2, 1] });
    return () => c.stop();
  }, [mv, value]);
  return <motion.span className={className}>{text}</motion.span>;
}
