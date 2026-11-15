/** Altitude bands (metres) → marker colour, shared by the radar markers and its legend. */
export const ALTITUDE_BANDS: { max: number; color: string; label: string }[] = [
  { max: 1_500, color: "#fbbf24", label: "< 5k ft" },
  { max: 4_500, color: "#a3e635", label: "5–15k" },
  { max: 7_500, color: "#34d399", label: "15–25k" },
  { max: 10_000, color: "#38bdf8", label: "25–33k" },
  { max: Infinity, color: "#a78bfa", label: "33k+" },
];
export const GROUND_COLOR = "#64748b";
export const EMERGENCY_COLOR = "#f43f5e";

export function altitudeColor(altitude: number | null, onGround: boolean): string {
  if (onGround) return GROUND_COLOR;
  if (altitude == null) return "#94a3b8";
  return ALTITUDE_BANDS.find((b) => altitude < b.max)!.color;
}

/** Transponder codes that signal an emergency. */
export const EMERGENCY_SQUAWKS: Record<string, string> = {
  "7500": "Unlawful interference",
  "7600": "Radio failure",
  "7700": "General emergency",
};

export const isEmergency = (squawk: string | null | undefined) => !!squawk && squawk in EMERGENCY_SQUAWKS;

/** Metres → flight level string, e.g. 10_668 → "FL350". */
export function flightLevel(altitude: number | null, onGround = false): string {
  if (onGround) return "GND";
  if (altitude == null) return "—";
  return `FL${Math.max(0, Math.round((altitude * 3.28084) / 100)).toString().padStart(3, "0")}`;
}
