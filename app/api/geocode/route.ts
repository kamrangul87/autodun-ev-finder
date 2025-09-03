import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q) return new Response(JSON.stringify({ error: "Missing q" }), { status: 400 });

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=gb`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Autodun-EV-Finder/1.0 (contact: info@autodun.com)" }
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
}
