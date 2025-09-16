export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
// Import the GET handler from the stations API.  We do not import
// anything else from the stations module to keep this file lean.  The
// stations handler implements all bounding-box and centre-based
// filtering logic.
import { GET as stationsGET } from '../stations/route';

// Always run dynamically; this ensures that bounding-box queries are
// processed at runtime and are not statically optimised.
export const dynamic = 'force-dynamic';

/**
 * Site wrapper around the stations API.  Accepts a `bbox` query
 * parameter in the form `west,south,east,north` and forwards the
 * request to the underlying stations handler after translating this
 * parameter into the individual north/south/east/west parameters
 * expected by the stations endpoint.  Any other query parameters
 * (e.g. `conn`, `minPower`, `source`) are passed through unchanged.
 */
export async function GET(req: NextRequest) {
  // Parse the incoming URL so we can manipulate search parameters.
  const url = new URL(req.url);
  const sp = url.searchParams;
  // If a bbox is provided, split it into the four components and map
  // them to the corresponding parameters.  The order is west,south,east,north.
  const bbox = sp.get('bbox');
  if (bbox) {
    const parts = bbox.split(',').map((p) => p.trim());
    if (parts.length === 4) {
      const [west, south, east, north] = parts;
      sp.set('west', west);
      sp.set('south', south);
      sp.set('east', east);
      sp.set('north', north);
    }
    // Remove the bbox parameter so that the stations handler doesn't
    // interpret it incorrectly.
    sp.delete('bbox');
    // Reconstruct the URL with the modified search parameters.
    url.search = sp.toString();
  }
  // Construct a new request object targeting the stations handler.  We
  // explicitly set the pathname to the stations route so that the
  // handler sees the correct endpoint.  All headers from the
  // original request are preserved.
  const proxiedUrl = new URL(url.toString());
  proxiedUrl.pathname = proxiedUrl.pathname.replace(/\/sites$/, '/stations');
  const proxyReq = new NextRequest(proxiedUrl.toString(), {
    headers: req.headers,
    method: req.method,
  });
  // Delegate to the stations GET handler.  Since the handler returns
  // a Response object, we simply return it directly.
  return stationsGET(proxyReq);
}
