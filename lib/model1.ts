export interface OCMStation {
  ID: number;
  AddressInfo: {
    Latitude: number;
    Longitude: number;
    Title?: string | null;
    AddressLine1?: string | null;
    Town?: string | null;
    Postcode?: string | null;
  };
  Connections: Array<{
    PowerKW: number | null;
    ConnectionType: {
      Title: string | null;
      FormalName: string | null;
    };
  }>;
  StatusType?: {
    Title: string | null;
    IsOperational: boolean | null;
  };
  Feedback?: {
    count: number;
    averageRating: number | null;
    reliability: number | null;
  };
  DataSource?: string;
}

export type StationFeatures = {
  totalKW: number;
  maxKW: number;
  numConnectors: number;
};

export function featuresFor(s: Partial<OCMStation> | any): StationFeatures {
  if (typeof s?.connectors === 'number') {
    const count = Number(s.connectors);
    const totalKW = count * 7;
    const maxKW = count > 0 ? 7 : 0;
    const numConnectors = count;
    return { totalKW, maxKW, numConnectors };
  }
  const connections: any[] = Array.isArray(s?.Connections) ? s.Connections : [];
  const powers = connections.map((c: any) => {
    const p = Number(c?.PowerKW);
    return Number.isFinite(p) ? p : 0;
  });
  const totalKW = powers.reduce((acc, v) => acc + v, 0);
  const maxKW = powers.length ? Math.max(...powers) : 0;
  const numConnectors = powers.length;
  return { totalKW, maxKW, numConnectors };
}

export function scoreFor(f: StationFeatures): number {
  const scaledTotal = f.totalKW / 100;
  const scaledMax = f.maxKW / 50;
  const scaledCount = f.numConnectors / 10;
  return (scaledTotal + scaledMax + scaledCount) / 3;
}
