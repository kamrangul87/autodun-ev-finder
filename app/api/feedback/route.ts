import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const FILE_PATH = '/tmp/feedback.json';

type Feedback = {
  stationId: string | number;
  rating: number; // 0..5
  comment?: string | null;
  ts: number;
};

function readAll(): Feedback[] {
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeAll(items: Feedback[]) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(items, null, 2), 'utf8');
  } catch (e) {
    // ignore
  }
}

export async function GET(req: NextRequest) {
  const items = readAll();
  const { searchParams } = new URL(req.url);
  const stationId = searchParams.get('stationId');

  if (stationId) {
    const v = items.filter(i => String(i.stationId) === String(stationId));
    const count = v.length;
    const avg = count ? v.reduce((a,b) => a + (b.rating||0), 0) / count : 0;
    const reliability = Math.max(0, Math.min(100, Math.round((avg/5)*100)));
    return NextResponse.json({ count, averageRating: avg, reliability });
  }
  return NextResponse.json({ items: items.slice(-50) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  if (!body || (body.stationId===undefined || body.rating===undefined)) {
    return NextResponse.json({ error: 'stationId and rating required' }, { status: 400 });
  }
  const record: Feedback = {
    stationId: body.stationId,
    rating: Number(body.rating) || 0,
    comment: body.comment ?? null,
    ts: Date.now()
  };
  const items = readAll();
  items.push(record);
  writeAll(items);
  return NextResponse.json({ success: true });
}
