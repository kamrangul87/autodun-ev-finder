export type CouncilHit = {
  name: string;
  code?: string;
  type?: string;
  region?: string;
  country?: string;
  bbox?: number[]; // [minLng, minLat, maxLng, maxLat]
};

export async function getCouncilAtPoint(lat: number, lng: number): Promise<CouncilHit | null> {
  try {
    const res = await fetch(`/api/council?mode=point&lat=${lat}&lng=${lng}`);
    if (!res.ok) return null;
    const data = await res.json();

    // Expect either a single feature or features[0]
    const feat = data?.feature || data?.features?.[0];
    if (!feat) return null;

    const p = feat.properties || {};
    const bbox = feat.bbox || data?.bbox;

    return {
      name: p.name || p.council || p.LAD23NM || "Unknown",
      code: p.code || p.gss_code || p.LAD23CD || undefined,
      type: p.type || p.LAD23NMW || undefined,
      region: p.region || p.RGN22NM || undefined,
      country: p.country || p.CTRY22NM || undefined,
      bbox,
    };
  } catch {
    return null;
  }
}
