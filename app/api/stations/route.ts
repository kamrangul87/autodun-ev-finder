import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const lat = parseFloat(searchParams.get('lat') || '');
  const lon = parseFloat(searchParams.get('lon') || '');
  const dist = Math.max(1, Math.min(100, Number(searchParams.get('dist') || 10)));
  const minPower = Math.max(0, Number(searchParams.get('minPower') || 0));
  const connQuery = (searchParams.get('conn') || '').toLowerCase().trim();

  // If coords are missing, never crash the client — return empty array
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const key =
    process.env.OPENCHARGEMAP_API_KEY || process.env.NEXT_PUBLIC_OPENCHARGEMAP_API_KEY || '';

  const url = new URL('https://api.openchargemap.io/v3/poi/');
  url.searchParams.set('output', 'json');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('distance', String(dist));
  url.searchParams.set('distanceunit', 'km');
  url.searchParams.set('maxresults', '200');
  url.searchParams.set('compact', 'true');
  url.searchParams.set('verbose', 'false');
  if (key) url.searchParams.set('key', key);

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Autodun-EV-Finder/1.0 (contact: info@autodun.com)',
    },
    cache: 'no-store',
  });

  const raw = await res.json().catch(() => []);
  const list: any[] = Array.isArray(raw) ? raw : [];

  // ---- filtering helpers ----------------------------------------------------
  const matchesConnector = (station: any): boolean => {
    if (!connQuery) return true; // “Any”

    const connections: any[] = Array.isArray(station?.Connections)
      ? station.Connections
      : [];

    // Build a normalized label list
    const labels: string[] = connections.map((c: any) =>
      String(c?.ConnectionType?.FormalName || c?.ConnectionType?.Title || '').toLowerCase()
    );

    if (connQuery === 'type 2') {
      return labels.some((t: string) => t.includes('type 2') || t.includes('mennekes'));
    }
    if (connQuery === 'ccs') {
      return labels.some((t: string) => t.includes('ccs') || t.includes('combo'));
    }
    if (connQuery === 'chademo') {
      return labels.some((t: string) => t.includes('chademo'));
    }
    // Fallback: substring match
    return labels.some((t: string) => t.includes(connQuery));
  };

  const matchesPower = (station: any): boolean => {
    if (!minPower) return true;
    const connections: any[] = Array.isArray(station?.Connections)
      ? station.Connections
      : [];
    return connections.some((c: any) => (Number(c?.PowerKW) || 0) >= minPower);
  };

  const keep = (s: any) => matchesConnector(s) && matchesPower(s);

  // ---- trim payload sent to client -----------------------------------------
  const trimmed = list.filter(keep).map((s: any) => ({
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
    Connections: (Array.isArray(s.Connections) ? s.Connections : []).map((c: any) => ({
      ConnectionType: {
        Title: c?.ConnectionType?.Title,
        FormalName: c?.ConnectionType?.FormalName,
      },
      PowerKW: c?.PowerKW,
      Amps: c?.Amps,
      Voltage: c?.Voltage,
    })),
  }));

  return new Response(JSON.stringify(trimmed), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
