import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const runtime = 'nodejs';

export async function GET() {
  try {
    // Check for env variable first
    const councilDataUrl = process.env.COUNCIL_DATA_URL;
    
    if (councilDataUrl) {
      const response = await fetch(councilDataUrl);
      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data, {
          headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          },
        });
      }
    }

    // Fallback to local file
    const filePath = join(process.cwd(), 'public', 'data', 'councils-london.geo.json');
    const fileContent = await readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Council API error:', error);
    return NextResponse.json(
      { error: 'Failed to load council data' },
      { status: 500 }
    );
  }
}
