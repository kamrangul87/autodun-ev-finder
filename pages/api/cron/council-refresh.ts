// pages/api/cron/council-refresh.ts
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Cron endpoint to warm council-related caches.
 * Safe to run via Vercel Cron.
 */

type WarmResult = {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
};

type BBox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

// A few UK windows to "warm". Adjust as needed.
const BBOXES: BBox[] = [
  [-0.489, 51.28, 0.236, 51.686], // Greater London
  [-2.35, 53.33, -2.15, 53.55],   // Manchester
  [-1.98, 52.37, -1.73, 52.56],   // Birmingham
  [-1.66, 53.74, -1.38, 53.87],   // Leeds
];

function getBaseUrl(req: NextApiRequest): string {
  const host = (req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? "localhost:3000";
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
  return `${proto}://${host}`;
}

// Use const arrow to avoid any declaration/implementation split issues
const warm = async (url: string): Promise<WarmResult> => {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12_000); // 12s safety timeout

    const res = await fetch(url, {
      method: "GET",
      signal: ac.signal,
      headers: { "user-agent": "autodun-cron-warm/1.0" },
    });

    clearTimeout(t);
    return { url, ok: res.ok, status: res.status };
  } catch (e: any) {
    return { url, ok: false, error: e?.message ?? "fetch failed" };
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const base = getBaseUrl(req);

    // Core council endpoints
    const coreUrls = [
      `${base}/api/council`,
      `${base}/api/council?mode=point`,
    ];

    // Optional bbox warms (harmless if ignored by your API)
    const bboxUrls: string[] = [];
    for (const [minLon, minLat, maxLon, maxLat] of BBOXES) {
      const bboxParam = `${minLon},${minLat},${maxLon},${maxLat}`;
      bboxUrls.push(
        `${base}/api/council?mode=point&bbox=${encodeURIComponent(bboxParam)}`
      );
    }

    const toHit = [...coreUrls, ...bboxUrls];

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
