import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

async function fetchWithTimeout(url: string, ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const CACHE_HDR = { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" };

  // 1) Remote (if provided)
  const councilDataUrl = process.env.COUNCIL_DATA_URL;
  if (councilDataUrl) {
    try {
      const data = await fetchWithTimeout(councilDataUrl, 6000);
      return NextResponse.json(data, { headers: CACHE_HDR });
    } catch (e) {
      console.warn("Councils remote fetch failed, falling back to local:", (e as Error).message);
    }
  }

  // 2) Local static fallback
  try {
    const filePath = join(process.cwd(), "public", "data", "councils-london.geo.json");
    const fileContent = await readFile(filePath, "utf-8");
    const data = JSON.parse(fileContent);
    return NextResponse.json(data, { headers: CACHE_HDR });
  } catch (e) {
    console.warn("Councils local file missing/unreadable, falling back to empty:", (e as Error).message);
  }

  // 3) Final safe fallback (keeps UI alive)
  return NextResponse.json(
    { type: "FeatureCollection", features: [] },
    { headers: CACHE_HDR }
  );
}
