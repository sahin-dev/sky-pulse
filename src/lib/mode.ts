import "server-only";
import type { DataMode } from "./types";

/**
 * FLIGHT_DATA = free | aviationstack | demo
 * Default: "aviationstack" when AVIATIONSTACK_API_KEY is set, otherwise "free".
 */
export function dataMode(): DataMode {
  const m = process.env.FLIGHT_DATA;
  if (m === "demo" || m === "free") return m;
  if (m === "aviationstack" && process.env.AVIATIONSTACK_API_KEY) return "aviationstack";
  return process.env.AVIATIONSTACK_API_KEY ? "aviationstack" : "free";
}
