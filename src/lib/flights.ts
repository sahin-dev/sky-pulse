import "server-only";
import { getFlightsInArea as aviationstackArea } from "./area";
import * as aviationstack from "./aviationstack";
import { withLivePosition } from "./flight-live";
import { freeArea, freeFlight, freeLiveFlights, freeSearch } from "./free/flights";
import { dataMode } from "./mode";
import type { AreaResult, BBox, DataMode, Flight, FlightQuery, FlightResult, TrackPoint } from "./types";

/**
 * Single entry point for flight data. Pages and API routes call these; the
 * active data mode (see lib/mode.ts) decides where the data comes from.
 *
 * In "aviationstack" mode, if aviationstack can't serve requests (plan quota
 * used up, invalid key, …) we fall back to the free sources automatically and
 * stop calling aviationstack for a while (circuit breaker), so the site keeps
 * working and the remaining quota isn't wasted on failing calls.
 */

let pausedUntil = 0;
let pauseNotice: string | null = null;

function noticeFor(e: aviationstack.FlightApiError) {
  return e.code === "usage_limit_reached"
    ? "aviationstack's plan limit is reached, so this page uses free live data (ADS-B + open route database) until the quota renews."
    : `aviationstack is unavailable (${e.message}) — showing free live data instead.`;
}

/** Prefix the fallback notice, keeping any notice the free source set itself (e.g. limited coverage). */
function withNotice<T extends { notice?: string | null }>(result: T, notice: string | null): T {
  return { ...result, notice: [notice, result.notice].filter(Boolean).join(" ") || null };
}

/** Run the aviationstack variant, or the free variant when aviationstack is paused / just failed. */
async function withFallback<T extends { mode: DataMode; notice?: string | null }>(
  viaAviationstack: () => Promise<T>,
  viaFree: () => Promise<T>,
): Promise<T> {
  const mode = dataMode();
  if (mode === "free") return viaFree();
  if (mode === "aviationstack" && Date.now() < pausedUntil) return withNotice(await viaFree(), pauseNotice);
  try {
    return await viaAviationstack();
  } catch (e) {
    if (mode !== "aviationstack" || !aviationstack.isUnavailableError(e)) throw e;
    pausedUntil = Date.now() + aviationstack.UNAVAILABLE_FOR[e.code];
    pauseNotice = noticeFor(e);
    return withNotice(await viaFree(), pauseNotice);
  }
}

export async function getLiveFlights(now: number): Promise<FlightResult> {
  return withFallback(
    () => aviationstack.getLiveFlights(now),
    () => freeLiveFlights(now),
  );
}

export async function searchFlights(q: FlightQuery, now: number): Promise<FlightResult> {
  return withFallback(
    () => aviationstack.searchFlights(q, now),
    () => freeSearch(q, now),
  );
}

export async function getFlightsInArea(box: BBox, now: number): Promise<AreaResult> {
  return withFallback(
    () => aviationstackArea(box, now),
    () => freeArea(box, now),
  );
}

export interface FlightPageData {
  flight: Flight | null;
  others: Flight[];
  track: TrackPoint[] | null;
  mode: DataMode;
  notice?: string | null;
}

/** Everything the flight page needs: the flight (with live ADS-B position where possible) and its flown track. */
export async function getFlightPage(
  code: string,
  now: number,
  opts: { date?: string; dep?: string; hex?: string } = {},
): Promise<FlightPageData> {
  return withFallback<FlightPageData>(
    async () => {
      const mode = dataMode();
      const { flight, others } = await aviationstack.getFlight(code, now, opts);
      if (!flight) return { flight: null, others, track: null, mode };
      // Simulated (demo) flights must never pick up a real aircraft's position.
      if (mode === "demo") return { flight, others, track: null, mode };
      const live = await withLivePosition(flight);
      return { flight: live.flight, others, track: live.track, mode };
    },
    async () => {
      const { flight, track } = await freeFlight(code, now, { hex: opts.hex });
      return { flight, others: [], track, mode: "free" };
    },
  );
}
