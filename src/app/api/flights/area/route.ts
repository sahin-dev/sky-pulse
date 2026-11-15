import type { NextRequest } from "next/server";
import { parseBBox } from "@/lib/area";
import { getFlightsInArea } from "@/lib/flights";
import { attempt } from "@/lib/server-utils";

/**
 * GET /api/flights/area?s=..&w=..&n=..&e=..
 * Airborne flights inside a map viewport. Backed by server-side caches, so
 * panning around the map does not translate 1:1 into aviationstack requests.
 */
export async function GET(request: NextRequest) {
  const box = parseBBox(request.nextUrl.searchParams);
  if (!box) {
    return Response.json({ error: "Expected numeric s, w, n, e query parameters (s < n, w < e)." }, { status: 400 });
  }
  const now = Date.now();
  const res = await attempt(() => getFlightsInArea(box, now));
  if (!res.ok) return Response.json({ error: res.message }, { status: 502 });
  return Response.json(res.data, { headers: { "Cache-Control": "no-store" } });
}
