import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    console.log('[Cron] Refreshing charger and council data...');
    return NextResponse.json({ ok: true, message: 'Data refresh simulated' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || 'Failed to refresh data' }, { status: 500 });
  }
}
