// pages/api/cron/council-refresh.ts
export const config = { runtime: "nodejs" };
export const dynamic = "force-dynamic";

// quick sample points to hit point-mode
const SAMPLE_POINTS = [
  { lat: 51.5074, lng: -0.1278 }, // London
  { lat: 53.4808, lng: -2.2426 }, // Manchester
  { lat: 55.9533, lng: -3.1883 }, // Edinburgh
  { lat: 54.9783, lng: -1.6178 }, // Newcastle
];

export default async function handler(_req, res) {
  try {
    // warm a few bbox windows (map will reuse)
    const bboxes = [
      "-5.0,50.0,-4.0,51.0",
      "-4.0,51.0,-2.0,52.0",
      "-3.5,52.5,-1.5,53.8",
      "-2.9,53.8,-1.0,55.2",
      "-3.6,55.2,-2.0,56.5",
      "-2.5,56.5,-1.0,60.0",
    ];
    const bboxResults = [];
    for (const bb of bboxes) {
      const r = await fetch(`/api/council?mode=bbox&bbox=${bb}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      bboxResults.push({ bbox: bb, ok: r.ok, features: Array.isArray(j?.features) ? j.features.length : 0 });
      await new Promise(r => setTimeout(r, 120));
    }

    // sanity point lookups
    const pointResults = [];
    for (const p of SAMPLE_POINTS) {
      const r = await fetch(`/api/council?mode=point&lat=${p.lat}&lng=${p.lng}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      pointResults.push({ p, ok: r.ok, name: j?.feature?.properties?.name ?? j?.properties?.name ?? null });
      await new Promise(r => setTimeout(r, 100));
    }

    return res.status(200).json({ ok: true, bboxResults, pointResults });
  } catch (e: any) {
    console.error("[cron/council-refresh] error", e?.message || e);
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
