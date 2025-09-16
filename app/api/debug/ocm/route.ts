import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const hasOCM =
    Boolean(process.env.OPENCHARGEMAP_API_KEY) || Boolean(process.env.OCM_API_KEY);
  const minRadius = Number(process.env.OCM_MIN_RADIUS_KM) || 8;
  return new Response(JSON.stringify({ hasOCMKey: hasOCM, minRadiusKm: minRadius }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
