import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ok: true, message: "API routes are reachable" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
