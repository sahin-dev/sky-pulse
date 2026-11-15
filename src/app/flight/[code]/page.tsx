import type { Metadata } from "next";
import { Suspense } from "react";
import { FlightDetail } from "@/components/FlightDetail";
import { EmptyPanel, ErrorPanel } from "@/components/Notices";
import { airportByIata } from "@/lib/airports";
import { getFlightPage } from "@/lib/flights";
import { airportWeather } from "@/lib/weather";
import { attempt, requestNow } from "@/lib/server-utils";

export async function generateMetadata(props: PageProps<"/flight/[code]">): Promise<Metadata> {
  const { code } = await props.params;
  return { title: `Flight ${decodeURIComponent(code).toUpperCase()}` };
}

export default function FlightPage(props: PageProps<"/flight/[code]">) {
  return (
    <div className="mx-auto max-w-7xl px-6 pt-6">
      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Detail({
  params,
  searchParams,
}: {
  params: PageProps<"/flight/[code]">["params"];
  searchParams: PageProps<"/flight/[code]">["searchParams"];
}) {
  const [{ code: rawCode }, sp] = await Promise.all([params, searchParams]);
  const code = decodeURIComponent(rawCode).replace(/\s+/g, "").toUpperCase();
  const date = typeof sp.date === "string" ? sp.date : undefined;
  const dep = typeof sp.dep === "string" ? sp.dep : undefined;
  const hex = typeof sp.hex === "string" ? sp.hex : undefined;

  // Flight numbers (BA117, EK203) or ICAO callsigns (BAW117, QTR31T).
  if (!/^([A-Z0-9]{2}\d{1,4}[A-Z]?|[A-Z]{3}\d{1,4}[A-Z]{0,2})$/.test(code)) {
    return (
      <EmptyPanel
        title="That doesn't look like a flight number"
        message="Use a flight number like BA117 or EK203, or a callsign like BAW117."
      />
    );
  }

  const now = await requestNow();
  const res = await attempt(() => getFlightPage(code, now, { date, dep, hex }));
  if (!res.ok) return <ErrorPanel message={res.message} />;
  const { flight, others, track, mode, notice } = res.data;
  if (!flight) {
    return (
      <EmptyPanel
        title={`No data for ${code}`}
        message={
          mode === "free"
            ? "It isn't airborne right now and its callsign isn't in the open route database. Airlines don't always use the flight number as callsign — try searching the route instead."
            : "We couldn't find this flight for today. It may not be operating, or the flight number may be different."
        }
      />
    );
  }
  // Airport weather (METAR/TAF): free, public-domain data; a failure just hides the section.
  const icao = (e: { icao: string; iata: string }) => e.icao || airportByIata(e.iata)?.icao || "";
  const [depIcao, arrIcao] = [icao(flight.departure), icao(flight.arrival)];
  const wx = await attempt(() => airportWeather([depIcao, arrIcao]));
  const weather = wx.ok ? { departure: wx.data[depIcao] ?? null, arrival: wx.data[arrIcao] ?? null } : null;

  return (
    <FlightDetail flight={flight} track={track} others={others} now={now} mode={mode} notice={notice} weather={weather} />
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-6 w-24 rounded-lg" />
      <div className="skeleton h-80 rounded-[2rem]" />
      <div className="skeleton h-[420px] rounded-[2rem] sm:h-[520px]" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="skeleton h-80 rounded-3xl" />
        <div className="skeleton h-80 rounded-3xl" />
        <div className="skeleton h-80 rounded-3xl" />
      </div>
    </div>
  );
}
