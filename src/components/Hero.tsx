"use client";

import { motion } from "motion/react";
import { HeroGlobe } from "./HeroGlobe";
import { SearchBox } from "./SearchBox";

const WORDS = ["Track", "every", "flight,"];

export function Hero() {
  return (
    <section className="relative mx-auto grid max-w-7xl items-center gap-10 px-6 pt-10 pb-16 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/[0.06] px-3 py-1.5 text-xs text-sky-200"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-sky-400" />
          </span>
          Real-time positions, gates &amp; delays
        </motion.div>

        <h1 className="font-display text-5xl leading-[1.02] font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
          {WORDS.map((w, i) => (
            <motion.span
              key={w}
              className="mr-[0.25em] inline-block"
              initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, delay: 0.1 + i * 0.09, ease: [0.2, 0.7, 0.2, 1] }}
            >
              {w}
            </motion.span>
          ))}
          <br />
          <motion.span
            className="text-gradient inline-block"
            initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.42, ease: [0.2, 0.7, 0.2, 1] }}
          >
            in real time.
          </motion.span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.55 }}
          className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400"
        >
          Follow any flight across the globe — live position on the map, great-circle route, terminals, gates and delay
          updates in one place.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.7 }}
          className="mt-9"
        >
          <SearchBox />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, ease: [0.2, 0.7, 0.2, 1] }}
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 mx-auto aspect-square w-full max-w-[640px] opacity-40 lg:pointer-events-auto lg:relative lg:opacity-100"
      >
        <HeroGlobe className="size-full" />
      </motion.div>
    </section>
  );
}
