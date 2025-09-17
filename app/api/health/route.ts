import { NextRequest } from 'next/server';

// Always run this route dynamically.  Health checks should never be
// statically optimised away.
export const dynamic = 'force-dynamic';

/**
 * Simple health check endpoint.  Responds with a JSON body indicating
 * operational status.  This route can be polled by uptime monitors and
 * deployment pipelines to verify the API is reachable.
 */
export async function GET(_req: NextRequest) {
  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}