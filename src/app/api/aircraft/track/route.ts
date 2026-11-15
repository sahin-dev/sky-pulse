import type { NextRequest } from "next/server";
import { trackFor } from "@/lib/positions";

/** GET /api/aircraft/track?hex=4ca7b3 — the aircraft's actual flown track (OpenSky). */
export async function GET(request: NextRequest) {
  const hex = request.nextUrl.searchParams.get("hex")?.trim().toLowerCase() ?? "";
  if (!/^[0-9a-f]{6}$/.test(hex)) return Response.json({ error: "Expected hex (6 hex digits)." }, { status: 400 });
  const track = await trackFor(hex);
  return Response.json({ track: track ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
