import type { NextRequest } from "next/server";
import { searchAirports } from "@/lib/airports";

/** Airport autocomplete — served from the bundled dataset, costs no API quota. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const results = searchAirports(q.slice(0, 60), 8).map((a) => ({
    iata: a.iata,
    name: a.name,
    city: a.city,
    country: a.country,
  }));
  return Response.json(results, { headers: { "Cache-Control": "public, max-age=86400" } });
}
