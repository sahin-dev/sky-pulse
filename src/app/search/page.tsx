import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyPanel, ErrorPanel, ModeBanner } from "@/components/Notices";
import { SearchBox } from "@/components/SearchBox";
import { SearchResults } from "@/components/SearchResults";
import { searchFlights } from "@/lib/flights";
import { parseSearch } from "@/lib/search";
import { attempt, requestNow } from "@/lib/server-utils";

export const metadata: Metadata = { title: "Search flights" };

export default function SearchPage(props: PageProps<"/search">) {
  return (
    <div className="mx-auto max-w-7xl px-6 pt-10">
      <div className="mb-10">
        <SearchBox compact />
      </div>
      <Suspense fallback={<ResultsSkeleton />}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const mode = typeof sp.mode === "string" ? sp.mode : null;
  const parsed = parseSearch(q, mode);

  if (!parsed) {
    return (
      <EmptyPanel
        title="Search for a flight"
        message="Enter a flight number, a route like JFK-LHR, an airport code, or an airline name."
      />
    );
  }

  const now = await requestNow();
  const res = await attempt(() => searchFlights(parsed.query, now));
  if (!res.ok) return <ErrorPanel message={res.message} />;
  const { flights, mode: dataMode, notice } = res.data;
  return (
    <section>
      <ModeBanner mode={dataMode} notice={notice} />
      <div className="mb-6">
        <p className="text-sm tracking-widest text-sky-300 uppercase">{parsed.kind} search</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-white sm:text-4xl">{parsed.label}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {flights.length} flight{flights.length === 1 ? "" : "s"} found
        </p>
      </div>
      {flights.length ? (
        <SearchResults flights={flights} now={now} />
      ) : (
        <EmptyPanel title="No flights found" message={`We couldn't find any flights for “${q}”. Check the code and try again.`} />
      )}
    </section>
  );
}

function ResultsSkeleton() {
  return (
    <div>
      <div className="skeleton mb-2 h-4 w-32 rounded" />
      <div className="skeleton mb-8 h-10 w-72 rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-56 rounded-3xl" />
        ))}
      </div>
    </div>
  );
}
