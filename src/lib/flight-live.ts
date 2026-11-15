import "server-only";
import { aircraftFor, applyState, trackFor } from "./positions";
import type { Flight, TrackPoint } from "./types";

/**
 * Upgrade a scheduled flight with ADS-B data: a fresh position (and missing
 * aircraft details) plus the actual flown track. Only for airborne flights;
 * an aircraft's ADS-B state belongs to whatever leg it is flying *now*.
 */
export async function withLivePosition(flight: Flight): Promise<{ flight: Flight; track: TrackPoint[] | null }> {
  if (flight.status !== "active") return { flight, track: null };

  const hex = flight.aircraft?.icao24?.toLowerCase() ?? null;
  const state = await aircraftFor(hex, flight.callsign);
  const enriched = state ? applyState(flight, state) : flight;

  const trackHex = hex ?? state?.hex ?? null;
  let track = await trackFor(trackHex);
  // Discard a track that started well before this flight's departure (a previous leg).
  const dep = flight.departure.actual?.utc ?? flight.departure.estimated?.utc ?? flight.departure.scheduled?.utc;
  if (track?.length && dep && track[0][3] < dep - 2 * 3600_000) track = null;

  return { flight: enriched, track: track?.length ? track : null };
}
