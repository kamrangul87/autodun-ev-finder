// lib/aiHeat.ts
type StationLike = { id?: string | number; lat: number; lng: number; };

export function weightFromScore(score: number | null | undefined) {
  if (score == null || Number.isNaN(score)) return 0.4; // gentle default
  const s = Math.max(0, Math.min(1, Number(score)));
  return 0.2 + 0.8 * s; // 0.2–1.0
}

export function buildHeatPoints(
  stations: StationLike[],
  scoresById?: Record<string | number, number>
) {
  return stations
    .filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map(s => {
      const sc =
        scoresById?.[String(s.id ?? "")] ??
        scoresById?.[Number(s.id ?? -1)];
      const w = scoresById ? weightFromScore(sc) : 1.0;
      return [s.lat, s.lng, w] as [number, number, number];
    });
}
