export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET() {
  const keyA = process.env.OCM_API_KEY?.trim();
  const keyB = process.env.OPENCHARGEMAP_API_KEY?.trim();
  const key = keyA || keyB || '';
  return NextResponse.json({
    hasOCMKey: !!key,
    keyName: keyA ? 'OCM_API_KEY' : keyB ? 'OPENCHARGEMAP_API_KEY' : null,
    // never echo the key value
  });
}
