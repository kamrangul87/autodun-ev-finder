// app/api/feedback/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* -----------------------------------------------------------------------------
   Types
----------------------------------------------------------------------------- */
type FeedbackRow = {
  rating: number;          // 0..5
  comment?: string;
  timestamp: number;       // ms epoch
  ip?: string;             // optional – for basic rate limiting / auditing
  ua?: string;             // optional – user agent
};

type Store = Record<number, FeedbackRow[]>;

/* -----------------------------------------------------------------------------
   In-memory fallback store (non-persistent across serverless instances)
----------------------------------------------------------------------------- */
function getMemStore(): Store {
  const g = globalThis as any;
  if (!g.__autodunFeedbackStore) g.__autodunFeedbackStore = {};
  return g.__autodunFeedbackStore as Store;
}

/* -----------------------------------------------------------------------------
   Optional Vercel KV (persistent). Route works without it.
----------------------------------------------------------------------------- */
function kvEnabled() {
  return !!(
    process.env.KV_REST_API_URL &&
    (process.env.KV_REST_API_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN)
  );
}

async function getKV() {
  // Lazy import so build doesn't fail if @vercel/kv isn't installed.
  const mod = await import('@vercel/kv').catch(() => null as any);
  return mod?.kv as
    | undefined
    | {
        incr: (key: string) => Promise<number>;
        expire: (key: string, ttlSec: number) => Promise<number>;
        hset: (key: string, obj: Record<string, any>) => Promise<unknown>;
        hgetall: <T = any>(key: string) => Promise<T | null>;
        zadd: (key: string, ...args: any[]) => Promise<unknown>;
        zrevrange: <T = string>(key: string, start: number, stop: number) => Promise<T[]>;
      };
}

/* -----------------------------------------------------------------------------
   Helpers
----------------------------------------------------------------------------- */
function ok(json: any, status = 200) {
  return NextResponse.json({ ok: true, ...json }, { status });
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function num(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function clientIp(req: NextRequest) {
  const hdr = req.headers.get('x-forwarded-for');
  return hdr?.split(',')[0]?.trim() || (req as any).ip || 'unknown';
}

/* -----------------------------------------------------------------------------
   POST /api/feedback
   Body accepted:
     - { stationId: number|string, rating: 0..5, comment? }
     - Back-compat: { stationId, waitTime:0..5, priceFair:0..5, working:boolean, comment? }
       -> derives a 0..5 "rating" if "rating" not provided
----------------------------------------------------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) ?? {};
    const stationIdNum = num(body?.stationId);

    // Parse rating or derive it from legacy fields
    let rating = num(body?.rating);
    if (rating == null) {
      const wait = Math.max(0, Math.min(5, num(body?.waitTime) ?? 0)); // 0 good, 5 bad
      const price = Math.max(0, Math.min(5, num(body?.priceFair) ?? 3)); // 0 bad, 5 good
      const working = !!body?.working;

      // Simple blend -> 0..5 (tuneable):
      // weight price fairness + working more; penalise long wait.
      const derived = (price * 0.45) + (working ? 2.0 : 0) + ((5 - wait) * 0.35);
      rating = Math.max(0, Math.min(5, Number(derived.toFixed(1))));
    }

    const comment =
      typeof body?.comment === 'string' ? String(body.comment).trim() : undefined;

    if (!(stationIdNum != null && Number.isFinite(stationIdNum))) {
      return bad('Invalid stationId');
    }
    if (!(rating >= 0 && rating <= 5)) {
      return bad('Invalid rating (must be 0–5)');
    }

    const row: FeedbackRow = {
      rating,
      comment,
      timestamp: Date.now(),
      ip: clientIp(req),
      ua: req.headers.get('user-agent') || '',
    };

    // Use KV if available (persistent + cross-instance)
    if (kvEnabled()) {
      const kv = await getKV();
      if (!kv) return bad('KV not available', 500);

      // very light IP rate-limit: 5 per minute
      const rlKey = `fb:rl:${row.ip}`;
      const count = await kv.incr(rlKey);
      if (count === 1) await kv.expire(rlKey, 60);
      if (count > 5) return bad('Too many submissions, try again in a minute', 429);

      const id = crypto.randomUUID();
      await kv.hset(`fb:${id}`, { stationId: stationIdNum, ...row });
      await kv.zadd(`fb:index:${stationIdNum}`, { score: row.timestamp, member: id });

      return ok({ id });
    }

    // Fallback: in-memory (non-persistent across serverless instances)
    const store = getMemStore();
    if (!store[stationIdNum]) store[stationIdNum] = [];
    store[stationIdNum].push(row);

    return ok({ stored: 'memory' });
  } catch (e: any) {
    console.error('POST /api/feedback error:', e);
    return bad('Failed to store feedback', 500);
  }
}

/* -----------------------------------------------------------------------------
   GET /api/feedback?stationId=123
   Returns: { ok:true, count, averageRating, reliability }
----------------------------------------------------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const stationIdNum = num(sp.get('stationId'));
    if (!(stationIdNum != null && Number.isFinite(stationIdNum))) {
      return bad('Missing or invalid stationId');
    }

    if (kvEnabled()) {
      const kv = await getKV();
      if (!kv) return bad('KV not available', 500);

      // newest -> oldest (limit 200)
      const ids = await kv.zrevrange<string>(`fb:index:${stationIdNum}`, 0, 199);
      const items = await Promise.all(
        ids.map(async (id) => (await kv.hgetall<FeedbackRow & { stationId: number }>(`fb:${id}`)) || null)
      );
      const fb = items.filter(Boolean) as (FeedbackRow & { stationId: number })[];

      const count = fb.length;
      const avg = count ? fb.reduce((s, r) => s + r.rating, 0) / count : null;
      const reliability = typeof avg === 'number' ? avg / 5 : null;

      return ok({ count, averageRating: avg, reliability });
    }

    // Fallback: in-memory
    const store = getMemStore();
    const fb = store[stationIdNum] ?? [];
    const count = fb.length;
    const avg = count ? fb.reduce((s, r) => s + r.rating, 0) / count : null;
    const reliability = typeof avg === 'number' ? avg / 5 : null;

    return ok({ count, averageRating: avg, reliability });
  } catch (e: any) {
    console.error('GET /api/feedback error:', e);
    return bad('Failed to fetch feedback', 500);
  }
}
