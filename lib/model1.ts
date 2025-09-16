/**
 * Model‑1 feature extraction and scoring functions.
 *
 * These helpers compute simple numeric features from an OpenChargeMap
 * station record and combine them into a single score.  The score is
 * designed to reflect the overall charging capacity at a site by
 * weighting total power, maximum individual connector power and the
 * number of connectors equally.
 */

// Type definitions for an OpenChargeMap station.  Only the fields
// required by the scoring logic are declared here.  Additional fields
// present in the API response are ignored.
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

/**
 * Numeric features derived from a station.  TotalKW is the sum of all
 * connector powers, maxKW is the highest individual connector power and
 * numConnectors is the number of connectors available.
 */
export type StationFeatures = {
  totalKW: number;
  maxKW: number;
  numConnectors: number;
};

/**
 * Compute feature metrics for a given station.  Undefined or null
 * connector powers are treated as zero.  If no connections are
 * provided, all metrics default to zero.
 */
export function featuresFor(s: Partial<OCMStation> | any): StationFeatures {
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

/**
 * Produce a single score from feature metrics.  Each component is
 * scaled to roughly similar ranges: totalKW is divided by 100 (so
 * 100 kW total contributes 1.0), maxKW by 50 (so a 50 kW connector
 * contributes 1.0) and numConnectors by 10.  The average of the
 * scaled components is returned.  Scores are not capped at 1.0 but
 * typical values fall within [0,1] for realistic station sizes.
 */
export function scoreFor(f: StationFeatures): number {
  const scaledTotal = f.totalKW / 100;
  const scaledMax = f.maxKW / 50;
  const scaledCount = f.numConnectors / 10;
  return (scaledTotal + scaledMax + scaledCount) / 3;
}