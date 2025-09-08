// app/api/stations/route.ts
import { NextRequest } from 'next/server';

type OCConnection = {
  ConnectionType?: { Title?: string; FormalName?: string };
  PowerKW?: number | null;
  Amps?: number | null;
  Voltage?: number | null;
};
type OCStation = {
  ID: number;
  AddressInfo?: {
    Title?: string;
    AddressLine1?: string;
    Town?: string;
    Postcode?: string;
    RelatedURL?: string;
    ContactTelephone1?: string;
    Latitude?: number;
    Longitude?: number;
  };
  Connections?: OCConnection[] | null;
};

const KEY_VARS = ['OCM_API_KEY', 'OPENCHARGEMAP_API_KEY', 'NEXT_PUBLIC_OPENCHARGEMAP_API_KEY'] as const;
function getOCMKey(): string {
  for (const k of KEY_VARS) {
    const v = process.env[k];
    if (v) return v;
  }
  return '';
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}
function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\s\-_/().]+/g, '');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const lat = Number(searchParams.get('lat'));
  const lon = Number(searchParams.get('lon'));
  const dist = clamp(Number(searchParams.get('dist') || 10), 1, 100);
  const minPower = Math.max(0, Number(searchParams.get('minPower') || 0));
  const connRaw = (searchParams.get('conn') || '').trim();
  const connQuery = connRaw.toLowerCase();
  const debug = searchParams.get('debug') === '1';

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return json([]); // never crash client
  }

  const key = getOCMKey();

  // Build OCM request
  const url = new URL('https://api.openchargemap.io/v3/poi/');
  url.searchParams.set('output', 'json');
  url.searchParams.set('countrycode', 'GB');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('distance', String(dist));
  url.searchParams.set('distanceunit', 'KM'); // uppercase as per docs
  url.searchParams.set('maxresults', '200');
  url.searchParams.set('compact', 'true');
  url.searchParams.set('verbose', 'false');
  if (key) url.searchParams.set('key', key); // query param form

  const headers: Record<string, string> = {
    'User-Agent': 'Autodun-EV-Finder/1.0 (contact: info@autodun.com)',
  };
  if (key) headers['X-API-Key'] = key; // header form

  const res = await fetch(url.toString(), {
    headers,
    cache: 'no-store',
  });

  // If OCM rejected us (rate limit / unauthorized), expose that in debug
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (debug) {
      return json({ error: true, status: res.status, bodySnippet: text.slice(0, 500), usedKey: !!key }, res.status);
    }
    // Return empty array to keep UI alive
    return json([]);
  }

  const raw: unknown = await res.json().catch(() => []);
  const list: OCStation[] = Array.isArray(raw) ? (raw as OCStation[]) : [];

  // ---- filtering helpers ----
  const isType2 = (t: string) => t.includes('type2') || t.includes('mennekes') || t.includes('iec621962');
  const isCCS = (t: string) => t.includes('ccs') || t.includes('combo') || t.includes('combinedchargingsystem') || t.includes('iec621963');
  const isCHAdeMO = (t: string) => t.includes('chademo');

  const matchesConnector = (s: OCStation) => {
    if (!connQuery) return true; // “Any”
    const labels: string[] = (Array.isArray(s.Connections) ? s.Connections : []).map((c) =>
      norm(c?.ConnectionType?.FormalName || c?.ConnectionType?.Title)
    );

    if (connQuery === 'type 2' || connQuery === 'type2') return labels.some(isType2);
    if (connQuery === 'ccs') return labels.some(isCCS);
    if (connQuery === 'chademo') return labels.some(isCHAdeMO);

    const qn = norm(connQuery);
    return labels.some((t) => t.includes(qn));
  };

  const matchesPower = (s: OCStation) => {
    if (!minPower) return true;
    const conns = Array.isArray(s.Connections) ? s.Connections : [];
    return conns.some((c) => (Number(c?.PowerKW) || 0) >= minPower);
  };

  let kept = list.filter((s) => matchesConnector(s) && matchesPower(s));

  // Trim payload for map safety
  kept = kept.slice(0, 400);

  // Minimal fields to client
  const out = kept.map((s) => ({
    ID: s.ID,
    AddressInfo: {
      Title: s.AddressInfo?.Title,
      AddressLine1: s.AddressInfo?.AddressLine1,
      Town: s.AddressInfo?.Town,
      Postcode: s.AddressInfo?.Postcode,
      RelatedURL: s.AddressInfo?.RelatedURL,
      ContactTelephone1: s.AddressInfo?.ContactTelephone1,
      Latitude: s.AddressInfo?.Latitude,
      Longitude: s.AddressInfo?.Longitude,
    },
    Connections: (Array.isArray(s.Connections) ? s.Connections : []).map((c) => ({
      ConnectionType: {
        Title: c?.ConnectionType?.Title,
        FormalName: c?.ConnectionType?.FormalName,
      },
      PowerKW: c?.PowerKW ?? null,
      Amps: c?.Amps ?? null,
      Voltage: c?.Voltage ?? null,
    })),
  }));

  if (debug) {
    const sampleLabels = list
      .flatMap((s) => (Array.isArray(s.Connections) ? s.Connections : []))
      .map((c) => c?.ConnectionType?.FormalName || c?.ConnectionType?.Title || '?')
      .slice(0, 80);

    return json(
      {
        query: { lat, lon, dist, minPower, conn: connRaw, usedKey: !!key },
        counts: { raw: list.length, kept: out.length },
        sampleLabels,
        note: 'Add &debug=1 to see this payload.',
      },
      200
    );
  }

  return json(out, 200);
}
