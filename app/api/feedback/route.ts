import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getStore(): Record<
  number,
  { rating: number; comment?: string; timestamp: number }[]
> {
  const globalAny = globalThis as any;
  if (!globalAny.__feedbackStore) {
    globalAny.__feedbackStore = {};
  }
  return globalAny.__feedbackStore as Record<
    number,
    { rating: number; comment?: string; timestamp: number }[]
  >;
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const stationId = Number(data?.stationId);
    const rating = Number(data?.rating);
    const comment =
      typeof data?.comment === 'string' ? String(data.comment).trim() : undefined;

    if (!Number.isFinite(stationId) || !(rating >= 0 && rating <= 5)) {
      return new Response(JSON.stringify({ error: 'Invalid stationId or rating' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const store = getStore();
    if (!store[stationId]) store[stationId] = [];
    store[stationId].push({ rating, comment, timestamp: Date.now() });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: 'Failed to store feedback' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const stationId = Number(sp.get('stationId'));
    if (!Number.isFinite(stationId)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid stationId' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const store = getStore();
    const fb = store[stationId] ?? [];
    const count = fb.length;
    const avg = count ? fb.reduce((sum, f) => sum + f.rating, 0) / count : null;
    const reliability = typeof avg === 'number' ? avg / 5 : null;

    return new Response(JSON.stringify({ count, averageRating: avg, reliability }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: 'Failed to fetch feedback' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
