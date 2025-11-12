// pages/api/cron/station-cache.ts
export const config = { runtime: "nodejs" };
export const dynamic = "force-dynamic";

const UK_BBOX = [-8.649, 49.823, 1.763, 60.845]; // lng1, lat1, lng2, lat2

function splitBbox([w, s, e, n]: number[], nx = 3, ny = 3) {
  const tiles: [number, number, number, number][] = [];
  const dx = (e - w) / nx, dy = (n - s) / ny;
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      const bb: [number, number, number, number] = [
        +(w + ix * dx).toFixed(6),
        +(s + iy * dy).toFixed(6),
        +(w + (ix + 1) * dx).toFixed(6),
        +(s + (iy + 1) * dy).toFixed(6),
      ];
      tiles.push(bb);
    }
  }
  return tiles;
}

export default async function handler(_req, res) {
  try {
    const tiles = splitBbox(UK_BBOX, 3, 4); // 12 quick tiles
    const results = [];
    for (const bb of tiles) {
      const bboxStr = bb.join(",");
      const url = `/api/stations?bbox=${bboxStr}&tiles=2&limitPerTile=750`;
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      results.push({ bbox: bboxStr, ok: r.ok, count: j?.count ?? j?.features?.length ?? 0, source: j?.source ?? "unknown" });
      // small delay to be gentle
      await new Promise(r => setTimeout(r, 150));
    }
    return res.status(200).json({ ok: true, warmed: results.length, results });
  } catch (e: any) {
    console.error("[cron/station-cache] error", e?.message || e);
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
