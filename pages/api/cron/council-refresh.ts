// pages/api/cron/council-refresh.ts
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Lightweight cron endpoint to warm council-related caches.
 * - Calls /api/council (polygons) and /api/council?mode=point (centroids)
 * - Optionally warms a few geographic windows to prime any bbox-aware logic
 *
 * Safe to run on a schedule via Vercel Cron.
 */

type WarmResult = {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
};

type BBox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

// A few UK windows to "warm". Adjust as you like.
const BBOXES: BBox[] = [
  [-0.489, 51.28, 0.236, 51.686], // Greater London
  [-2.35, 53.33, -2.15, 53.55],   // Manchester area
  [-1.98, 52.37, -1.73, 52.56],   // Birmingham area
  [-1.66, 53.74, -1.38, 53.87],   // Leeds area
];

function getBaseUrl(req: NextApiRequest): string {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:3000";
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
  return `${proto}://${host}`;
}

async function warm(url: string): Promise<Wa
