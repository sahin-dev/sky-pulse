import { Suspense } from "react";
import { Building2, Clock4, Globe2, Radar } from "lucide-react";
import { Hero } from "@/components/Hero";
import { LiveRadar } from "@/components/LiveRadar";
import { ErrorPanel, ModeBanner } from "@/components/Notices";
import { Reveal } from "@/components/Reveal";
import { getLiveFlights } from "@/lib/flights";
import { attempt, requestNow } from "@/lib/server-utils";

const FEATURES = [
  {
    icon: Radar,
    title: "Live radar",
    text: "See aircraft positions, altitude, speed and heading on an interactive dark map.",
  },
  {
    icon: Globe2,
    title: "Great-circle routes",
    text: "Routes follow the curve of the Earth, split into the distance flown and the distance left.",
  },
  {
    icon: Clock4,
    title: "Delays & timings",
    text: "Scheduled, estimated and actual times in each airport's local time zone.",
  },
  {
    icon: Building2,
    title: "Airport boards",
    text: "Departures and arrivals for any airport, with terminals, gates and baggage belts.",
  },
];

export default function Home() {
  return (
    <>
      <Hero />

      <section id="radar" className="mx-auto max-w-7xl scroll-mt-24 px-6 pt-8">
        <Reveal className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-sm font-medium tracking-widest text-sky-300 uppercase">Live radar</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">What&apos;s in the sky right now</h2>
          </div>
          <p className="max-w-md text-sm text-slate-400">
            Pan and zoom the map — flights load for the area you’re viewing. Select an aircraft to see its route.
          </p>
        </Reveal>
        <Suspense fallback={<RadarSkeleton />}>
          <RadarSection />
        </Suspense>
      </section>

      <section className="mx-auto max-w-7xl px-6 pt-28">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Everything about a flight, <span className="text-gradient">at a glance</span>
          </h2>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 0.08}>
              <div className="glass group h-full rounded-3xl p-6 transition-colors hover:border-sky-400/25">
                <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-sky-400/20 to-violet-500/20 text-sky-300 ring-1 ring-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6">
                  <Icon className="size-5" />
                </div>
                <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}

async function RadarSection() {
  const now = await requestNow();
  const res = await attempt(() => getLiveFlights(now));
  if (!res.ok) return <ErrorPanel message={res.message} />;
  const { flights, mode, notice } = res.data;
  return (
    <>
      <ModeBanner mode={mode} notice={notice} />
      <LiveRadar flights={flights} now={now} />
    </>
  );
}

function RadarSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="skeleton h-[460px] rounded-3xl sm:h-[600px]" />
      <div className="skeleton h-[460px] rounded-3xl sm:h-[600px]" />
    </div>
  );
}
