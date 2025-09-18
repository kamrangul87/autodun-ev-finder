import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (params[k] = v));
  return NextResponse.json(
    { path: url.pathname, params },
    { headers: { "Cache-Control": "no-store" } }
  );
}
