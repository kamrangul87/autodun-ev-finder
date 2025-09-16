import { NextRequest } from 'next/server';

// Force dynamic execution for this API route.  Without this flag Next.js
// might attempt to statically optimise the handler which would prevent
// updates to the in-memory feedback store from persisting between requests.
export const dynamic = 'force-dynamic';

// -----------------------------------------------------------------------------
// Simple in‑memory feedback store

// Retrieve (or initialise) the global feedback store.  We attach it to
// `globalThis` so that it persists across hot reloads within the same
// process.  The store maps a station ID to an array of feedback records.
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

// Handle POST requests to submit feedback.  The request body must contain a
// `stationId` (number) and `rating` (0–5).  An optional `comment` string may
// also be provided.  Feedback is appended to the global store under the
// corresponding station.  The response returns `{ success: true }` on
// success.  On validation failure a 400 status is returned.
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const stationId = Number(data?.stationId);
    const rating = Number(data?.rating);
    const comment = typeof data?.comment === 'string' ? String(data.comment).trim() : undefined;
    if (!Number.isFinite(stationId) || !(rating >= 0 && rating <= 5)) {
      return new Response(JSON.stringify({ error: 'Invalid stationId or rating' }), { status: 400 });
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
    return new Response(JSON.stringify({ error: 'Failed to store feedback' }), { status: 500 });
  }
}

// Handle GET requests to retrieve aggregated feedback for a station.  Accepts
// `stationId` as a query parameter.  Returns the number of feedback
// entries (`count`), the average rating (`averageRating`), and a
// reliability value normalised to [0,1] by dividing the average by 5.  If
// there is no feedback for the station, `averageRating` and `reliability`
// will be `null` and `count` will be 0.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const stationId = Number(sp.get('stationId'));
    if (!Number.isFinite(stationId)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid stationId' }), { status: 400 });
    }
    const store = getStore();
    const fb = store[stationId] ?? [];
    const count = fb.length;
    const avg = count ? fb.reduce((sum, f) => sum + f.rating, 0) / count : null;
    const reliability = typeof avg === 'number' ? avg / 5 : null;
    return new Response(
      JSON.stringify({ count, averageRating: avg, reliability }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: 'Failed to fetch feedback' }), { status: 500 });
  }
}