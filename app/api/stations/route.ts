

export const runtime = 'nodejs';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { ocmByBBox, ocmByRadius } from '../../../lib/stations/providers/opencharge';

function parseBBox(raw?: string): [number, number, number, number] | null {
  if (!raw) return null;
  const m = raw.match(/\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\),\s*\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
  if (!m) return null;
  const south = parseFloat(m[1]), west = parseFloat(m[2]), north = parseFloat(m[3]), east = parseFloat(m[4]);
  if ([south, west, north, east].some(n => Number.isNaN(n))) return null;
  return [south, west, north, east];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const bboxRaw = searchParams.get('bbox');
  const lat = searchParams.get('lat'); const lng = searchParams.get('lng');
  const radius = Number(searchParams.get('radius') ?? '10');
  const max = Number(searchParams.get('max') ?? '200');

  try {
    let payload;
    const bbox = parseBBox(bboxRaw ?? undefined);

    if (bbox) {
      payload = await ocmByBBox(bbox, max);
      if (!payload.items.length) {
        const centerLat = (bbox[0] + bbox[2]) / 2;
        const centerLng = (bbox[1] + bbox[3]) / 2;
        payload = await ocmByRadius(centerLat, centerLng, Math.max(radius, 8), max);
        payload.source = 'OCM_BBOX_FALLBACK';
      }
    } else if (lat && lng) {
      payload = await ocmByRadius(Number(lat), Number(lng), radius, max);
    } else {
      payload = await ocmByRadius(51.5074, -0.1278, 10, max); // London default
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ items: [], source: 'ERROR', error: String(e?.message ?? e) }, { status: 200 });
  }
}
