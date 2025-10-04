import { Station } from './types';

const DEMO_URL = '/data/stations-sample.json';
const OCM_URL = '/api/ocm';
const LOCAL_URL = '/api/local';

export type Source = 'DEMO' | 'OPENCHARGEMAP' | 'LOCAL';

export async function fetchStations(source: Source, params: Record<string, any>): Promise<{ items: Station[]; source: string }> {
  const timeout = 8000;
  let url = DEMO_URL;
  if (source === 'OPENCHARGEMAP') url = OCM_URL;
  if (source === 'LOCAL') url = LOCAL_URL;

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url + '?' + new URLSearchParams(params), { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) throw new Error('Fetch failed');
    const data = await res.json();
    if (!data.items || data.items.length < 5) throw new Error('Too few items');
    return { items: data.items, source };
  } catch (e) {
    // fallback to DEMO
    const res = await fetch(DEMO_URL);
    const data = await res.json();
    return { items: data.items, source: 'DEMO_FALLBACK' };
  }
}
