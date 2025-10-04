import demoData from '../../../data/stations-sample.json';
import type { Station } from '@/lib/stations/types';

const TIMEOUT = 8000;
const MIN_ITEMS = 5;

function getSource() {
  return process.env.STATIONS || 'DEMO';
}

async function fetchOCM(params: URLSearchParams) {
  // Simulate OCM fetch (replace with real fetch if needed)
  return { items: demoData.items, source: 'OPENCHARGEMAP' };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  let source = getSource();
  let result: { items: Station[]; source: string } = { items: [], source };
  let error = null;
  try {
    if (source === 'DEMO') {
      result = { items: demoData.items as Station[], source };
    } else if (source === 'OPENCHARGEMAP') {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), TIMEOUT);
      try {
        result = await fetchOCM(params) as { items: Station[]; source: string };
      } finally {
        clearTimeout(id);
      }
      if (!result.items || result.items.length < MIN_ITEMS) {
        result = { items: demoData.items as Station[], source: 'DEMO_FALLBACK' };
      }
    } else if (source === 'LOCAL') {
      // Add local fetch logic if needed
      result = { items: demoData.items as Station[], source: 'LOCAL' };
    }
  } catch (e) {
    result = { items: demoData.items as Station[], source: 'DEMO_FALLBACK' };
    error = e;
  }
  return Response.json(result);
}
