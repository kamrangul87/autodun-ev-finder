// app/api/feedback/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------- Types ----------
type FeedbackRow = {
  rating: number;
  comment?: string;
  timestamp: number;  // ms epoch
  ip?: string;
  ua?: string;
};

type Store = Record<number, FeedbackRow[]>;

// ---------- In-memory fallback store ----------
function getMemStore(): Store {
  const g = globalThis as any;
  if (!g.__autodunFeedbackStore) g.__autodunFeedbackStore = {};
  return g.__autodunFeedbackStore as Store;
}

// ---------- KV detection & lazy import ----------
function kvEnabled() {
  return !!(process.env.KV_REST_API_URL && (process.env.KV_REST_API_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN));
}

async function getKV() {
  // Lazy import so build doesn't fail when @vercel/kv isn't installed
  const mod = await import('@vercel/kv').catch(() => null as any);
  return mod?.kv as undefined | {
    incr: (key: string) => Promise<number>;
    expire: (key: string, ttlSec: number) => Promise<number>;
    hset: (key: string, obj: Record<string, any>) => Promise<unknown>;
    hgetall: <T=any>(key: string) => Promise<T | null>;
    zadd: (key: string, ...args: any[]) => Promise<unknown>;
    zrevrange: <T=string>(key: string, start: number, stop: number) => Promise<T[]>;
  };
}

// ---------- Utils ----------
function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function ok(json: any, init?: number) {
  return NextResponse.json({ ok: true, ...json }, { status: init ?? 200 });
}

function parseBodyNumber(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function getClientIp(req: NextRequest) {
  // X-Forwarded-For may contain list; take first
  const hdr = req.headers.get('x-forwarded-for');
  return hdr?.split(',')[0]?.trim() || (req as any).ip || 'unknown';
}

// ---------- POST /api/feedback ----------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const stationIdNum = parseBodyNumber(body?.stationId);
    const rating = parseBodyNumber(body?.rating);
    const comment = typeof body?.comment === 'string' ? String(body.comment).trim() : undefined;

    if (!Number.isFinite(stationIdNum!) || rating == null || rating < 0 || rating > 5) {
      return bad('Invalid stationId or rating (rating must be 0–5)');
    }

    const ip = getClientIp(req);
    const ua = req.headers.get('user-agent') || '';
    const row: FeedbackRow = { rating, comment, timestamp: Date.now(), ip, ua };

    // Prefer KV if configured
    if (kvEnabled()) {
      const kv = await getKV();
      if (!kv) return bad('KV not available', 500);

      // Simple IP rate-limit: 5/min
      const rlKey = `fb:rl:${ip}`;
      const count = await kv.incr(rlKey);
      if (count === 1) await kv.expire(rlKey, 60);
      if (count > 5) return bad('Too many submissions, try again in a minute', 429);

      const id = crypto.randomUUID();
      await kv.hset(`fb:${id}`, { stationId: stationIdNum, ...row });
      await kv.zadd(`fb:index:${stationIdNum}`, { score: row.timestamp, member: id });
      return ok({ id });
    }

    // In-memory fallback
    const store = getMemStore();
    if (!store[stationIdNum!]) store[stationIdNum!] = [];
    store[stationIdNum!].push(row);
    return ok({ stored: 'memory' });
  } catch (e: any) {
    console.error('POST /api/feedback error:', e);
    return bad('Failed to store feedback', 500);
  }
}

// ---------- GET /api/feedback?stationId=123 ----------
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const stationIdNum = parseBodyNumber(sp.get('stationId'));
    if (!Number.isFinite(stationIdNum!)) {
      return bad('Missing or invalid stationId');
    }

    if (kvEnabled()) {
      const kv = await getKV();
      if (!kv) return bad('KV not available', 500);

      // last 200 feedback items for the station (time-ordered newest first)
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

    // In-memory fallback
    const store = getMemStore();
    const fb = store[stationIdNum!] ?? [];
    const count = fb.length;
    const avg = count ? fb.reduce((sum, f) => sum + f.rating, 0) / count : null;
    const reliability = typeof avg === 'number' ? avg / 5 : null;

    return ok({ count, averageRating: avg, reliability });
  } catch (e: any) {
    console.error('GET /api/feedback error:', e);
    return bad('Failed to fetch feedback', 500);
  }
}
