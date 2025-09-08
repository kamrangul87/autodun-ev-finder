// app/api/stations/route.ts
import { NextRequest, NextResponse } from 'next/server';

type OCMConnection = {
  ConnectionTypeID?: number;
  ConnectionType?: { Title?: string; FormalName?: string } | null;
  PowerKW?: number | null;
};

type OCMPOI = {
  ID: number;
  AddressInfo?: {
    Title?: string;
    AddressLine1?: string;
    Town?: string;
    Postcode?: string;
    ContactTelephone1?: string;
    RelatedURL?: string;
    Latitude?: number;
    Longitude?: number;
  };
  Connections?: OCMConnection[] | null;
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const lat = parseFloat(url.searchParams.get('lat') ?? '');
    const lon = parseFloat(url.searchParams.get('lon') ?? '');
    const dist = parseFloat(url.searchParams.get('dist') ?? '10');
    const minPower = parseFloat(url.searchParams.get('minPower') ?? '0');
    const connRaw = (url.searchParams.get('conn') ?? '').trim();

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return NextResponse.json([]);
    }

    const params = new URLSearchParams();
    params.set('latitude', String(lat));
    params.set('longitude', String(lon));
    params.set('distance', String(Number.isFinite(dist) ? dist : 10));
    params.set('distanceunit', 'KM');
    params.set('countrycode', 'GB');
    params.set('maxresults', '100');
    params.set('minpowerkw', String(Number.isFinite(minPower) ? minPower : 0));
    // Return full data so UI can show connector names:
    params.set('compact', 'false');
    params.set('verbose', 'true');
    if (process.env.OCM_API_KEY) params.set('key', process.env.OCM_API_KEY);

    // Map connector names to OpenChargeMap ConnectionType IDs
    // Type 2 (Socket Only)=25, Type 2 (Tethered)=1036, CCS (Type 2)=33, CCS (Type 1)=32, CHAdeMO=2
    const connToIds = (q: string): number[] => {
      const c = q.toLowerCase();
      if (!c) return [];
      if (c === 'type 2' || c === 'type2' || c.includes('mennekes')) return [25, 1036];
      if (c === 'ccs' || c.includes('combo') || c === 'ccs2') return [33, 32];
      if (c === 'chademo' || c.includes('cha')) return [2];
      return [];
    };

    const ids = connToIds(connRaw);
    if (ids.length > 0) {
      params.set('connectiontypeid', ids.join(','));
    }

    const ocmUrl = `https://api.openchargemap.io/v3/poi/?${params.toString()}`;
    const r = await fetch(ocmUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) return NextResponse.json([]);

    const data = (await r.json()) as OCMPOI[] | null;
    const list = Array.isArray(data) ? data : [];
    return NextResponse.json(list);
  } catch (err) {
    console.error(err);
    return NextResponse.json([]);
  }
}
