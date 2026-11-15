import type { NextRequest } from "next/server";
import { aircraftFor, stateToLive } from "@/lib/positions";

/**
 * GET /api/aircraft?hex=4ca7b3&callsign=RYR123
 * Latest ADS-B position for one aircraft (adsb.lol / OpenSky — no aviationstack quota).
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const hex = sp.get("hex")?.trim().toLowerCase() || null;
  const callsign = sp.get("callsign")?.trim().toUpperCase() || null;
  if ((hex && !/^[0-9a-f]{6}$/.test(hex)) || (callsign && !/^[A-Z0-9]{2,8}$/.test(callsign)) || (!hex && !callsign)) {
    return Response.json({ error: "Expected hex (6 hex digits) and/or callsign." }, { status: 400 });
  }
  const state = await aircraftFor(hex, callsign);
  return Response.json(
    { state, live: state ? stateToLive(state) : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
