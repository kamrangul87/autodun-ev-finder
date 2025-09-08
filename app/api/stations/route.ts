import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const lat = parseFloat(searchParams.get('lat') || '');
  const lon = parseFloat(searchParams.get('lon') || '');
  const dist = Math.max(1, Math.min(100, Number(searchParams.get('dist') || 10))); // clamp 1–100km
  const minPower = Math.max(0, Number(searchParams.get('minPower') || 0));
  const connQuery = (searchParams.get('conn') || '').toLowerCase().trim();

  // If coordinates are missing, just return empty array (never crash the client)
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
  url.searchParams.set('maxresults', '200');      // grab enough to filter locally
  url.searchParams.set('compact', 'true');
  url.searchParams.set('verbose', 'false');
  if (key) url.searchParams.set('key', key);

  const res = await fetch(url.toString(), {
    headers: {
      // Helps OCM, also good etiquette
      'User-Agent': 'Autodun-EV-Finder/1.0 (contact: info@autodun.com)',
    },
    // Don’t cache so filters feel live
    cache: 'no-store',
  });

  const raw = await res.json().catch(() => []);
  const list: any[] = Array.isArray(raw) ? raw : [];

  // ---- Filtering helpers ----------------------------------------------------
  const matchesConnector = (station: any): boolean => {
    if (!connQuery) return true; // “Any”
    const labels = (station.Connections ?? []).map((c: any) =>
      String(
        c?.ConnectionType?.FormalName ||
        c?.ConnectionType?.Title ||
        ''
      ).toLowerCase()
    );

    // Normalise common names
    if (connQuery === 'type 2') {
      return labels.some((t) => t.includes('type 2') || t.includes('mennekes'));
    }
    if (connQuery === 'ccs') {
      // Many records include “ccs”, “combo” or “combined charging system”
      return labels.some((t) => t.includes('ccs') || t.includes('combo'));
    }
    if (connQuery === 'chademo') {
      return labels.some((t) => t.includes('chademo'));
    }
    // Fallback: substring match
    return labels.some((t) => t.includes(connQuery));
  };

  const matchesPower = (station: any): boolean => {
    if (!minPower) return true;
    return (station.Connections ?? []).some(
      (c: any) => (Number(c?.PowerKW) || 0) >= minPower
    );
  };

  const keep = (s: any) => matchesConnector(s) && matchesPower(s);

  // ---- Trim payload sent to the client --------------------------------------
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
    Connections: (s.Connections ?? []).map((c: any) => ({
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
