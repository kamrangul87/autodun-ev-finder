// pages/api/cron/station-cache.ts
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Cron endpoint to warm station caches across the UK using a simple grid of BBOX tiles.
 * Safe to run via Vercel Cron. No mutations — only GET requests.
 */

type WarmResult = {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
};

type BBox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

// Approx UK bounds (lon/lat)
const UK_BBOX: BBox = [-7.57, 49.90, 1.78, 58.70];

/** Split a bbox into rows x cols tiles */
function splitBbox([minLon, minLat, maxLon, maxLat]: BBox, rows: number, cols: number): BBox[] {
  const lonStep = (maxLon - minLon) / cols;
  const latStep = (maxLat - minLat) / rows;
  const out: BBox[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tMinLon = minLon + c * lonStep;
      const tMaxLon = tMinLon + lonStep;
      const tMinLat = minLat + r * latStep;
      const tMaxLat = tMinLat + latStep;
      out.push([tMinLon, tMinLat, tMaxLon, tMaxLat]);
    }
  }
  return out;
}

function getBaseUrl(req: NextApiRequest): string {
  const host = (req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? "localhost:3000";
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
  return `${proto}://${host}`;
}

const warm = async (url: string): Promise<WarmResult> => {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12_000); // 12s safety timeout

    const res = await fetch(url, {
      method: "GET",
      signal: ac.signal,
      headers: { "user-agent": "autodun-station-cache-cron/1.0" },
    });

    clearTimeout(t);
    return { url, ok: res.ok, status: res.status };
  } catch (e: any) {
    return { url, ok: false, error: e?.message ?? "fetch failed" };
  }
};

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const base = getBaseUrl(_req);

    // Core station endpoint (adjust if your route differs)
    const coreUrls = [`${base}/api/stations`];

    // 12 quick tiles across the UK (3 x 4)
    const tiles = splitBbox(UK_BBOX, 3, 4);
    const tileUrls = tiles.map(([a, b, c, d]) => {
      const bbox = `${a},${b},${c},${d}`;
      return `${base}/api/stations?bbox=${encodeURIComponent(bbox)}`;
    });

    const toHit = [...coreUrls, ...tileUrls];

    const results = await Promise.allSettled(toHit.map((u) => warm(u)));
    const parsed = results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : ({ url: toHit[i], ok: false, error: "unhandled rejection" } as WarmResult)
    );

    const okCount = parsed.filter((r) => r.ok).length;

    return res.status(200).json({
      ok: true,
      warmed: parsed.length,
      success: okCount,
      details: parsed,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err?.message ?? "unknown error",
    });
  }
}
