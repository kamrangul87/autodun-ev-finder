// lib/model1.ts
export type OCMConnection = {
  PowerKW?: number | null;
  ConnectionType?: { Title?: string | null; FormalName?: string | null } | null;
};

export type OCMStation = {
  ID: number;
  AddressInfo?: {
    Title?: string | null;
    AddressLine1?: string | null;
    Town?: string | null;
    Postcode?: string | null;
    Latitude?: number | null;
    Longitude?: number | null;
    ContactTelephone1?: string | null;
    RelatedURL?: string | null;
  } | null;
  Connections?: OCMConnection[] | null;
};

export type Features = { totalKW: number; maxKW: number; numConnectors: number };

export function featuresFor(s: OCMStation): Features {
  const conns = Array.isArray(s?.Connections) ? s!.Connections! : [];
  const kw = conns.map(c => Number(c?.PowerKW) || 0);
  return {
    totalKW: kw.reduce((a, b) => a + b, 0),
    maxKW: kw.reduce((m, v) => (v > m ? v : m), 0),
    numConnectors: conns.length,
  };
}

export function scoreFor(f: Features): number {
  const a = Math.log1p(f.totalKW);
  const b = 0.15 * f.numConnectors;
  const c = 0.002 * f.maxKW;
  return Number((a + b + c).toFixed(3));
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function matchesConn(s: OCMStation, connQuery: string): boolean {
  if (!connQuery) return true;
  const q = connQuery.trim().toLowerCase();
  const conns = Array.isArray(s?.Connections) ? s!.Connections! : [];
  const text = conns
    .map(c => (c?.ConnectionType?.FormalName || c?.ConnectionType?.Title || '').toLowerCase())
    .join(' | ');
  if (q.includes('type 2')) return /type\s*2|mennekes/.test(text);
  if (q.includes('ccs')) return /ccs|combo|combined/.test(text);
  if (q.includes('chademo')) return /chademo/.test(text);
  return text.includes(q);
}

export function hasAtLeastPower(s: OCMStation, minPower: number): boolean {
  if (!minPower || minPower <= 0) return true;
  const conns = Array.isArray(s?.Connections) ? s!.Connections! : [];
  return conns.some(c => (Number(c?.PowerKW) || 0) >= minPower);
}
