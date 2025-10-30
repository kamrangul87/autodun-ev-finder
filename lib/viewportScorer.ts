// lib/viewportScorer.ts
type StationLite = {
  id: string | number;
  lat: number; lng: number;
  connectors?: number;
  connectorsDetailed?: Array<{ powerKW?: number }>;
  PowerKW?: number; powerKW?: number;
  rating?: number; UserRating?: number; userRating?: number;
};

const inflight = new Set<string | number>();
const recently = new Map<string | number, number>(); // throttle per id

function safeNum(n: any, d?: number) {
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? v : d;
}

function featuresFor(st: StationLite) {
  const power_kw =
    safeNum(st.PowerKW ?? st.powerKW,
      Array.isArray(st.connectorsDetailed)
        ? Math.max(0, ...st.connectorsDetailed.map(c => safeNum(c?.powerKW, 0)))
        : undefined
    ) ?? 50;

  const n_connectors = st.connectors ?? 1;

  const has_fast_dc =
    (Array.isArray(st.connectorsDetailed) &&
      st.connectorsDetailed.some(c => (c?.powerKW ?? 0) >= 50)) ? 1 : 0;

  const rating =
    safeNum(st.rating ?? st.UserRating ?? st.userRating, 4.2) ?? 4.2;

  const has_geo = (typeof st.lat === "number" && typeof st.lng === "number") ? 1 : 0;

  return { power_kw, n_connectors, has_fast_dc, rating, usage_score: 1, has_geo };
}

/**
 * Score up to `limit` unscored stations in the viewport with small concurrency.
 * Calls `onScore(stationId, score)` for each success. Respects 30m localStorage cache.
 */
export async function scoreViewportStations(
  stations: StationLite[],
  knownScores: Record<string | number, number> | undefined,
  onScore: (id: string | number, score: number) => void,
  limit = 25,
  concurrency = 3
) {
  if (!stations?.length) return;

  const now = Date.now();
  // rank: prefer larger connector counts first
  const cand = stations
    .filter(s => knownScores?.[s.id] == null)
    .filter(s => !inflight.has(s.id) && (now - (recently.get(s.id) ?? 0) > 60_000)) // avoid hammering same id for 60s
    .sort((a, b) => (b.connectors ?? 1) - (a.connectors ?? 1))
    .slice(0, limit);

  const workers: Promise<void>[] = [];
  const queue = [...cand];

  for (let c = 0; c < concurrency; c++) {
    workers.push((async () => {
      for (;;) {
        const s = queue.shift();
        if (!s) return;
        inflight.add(s.id);
        recently.set(s.id, Date.now());
        try {
          // 30 min client cache
          const k = `aiScore:${String(s.id)}`;
          const cachedRaw = localStorage.getItem(k);
          if (cachedRaw) {
            try {
              const { score, t } = JSON.parse(cachedRaw);
              if (typeof score === "number" && Date.now() - t < 30*60*1000) {
                onScore(s.id, score);
                inflight.delete(s.id);
                continue;
              }
            } catch {}
          }

          const body = featuresFor(s);
          const r = await fetch(`/api/score?stationId=${encodeURIComponent(String(s.id))}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const j = await r.json();
          const score = typeof j?.score === "number" ? j.score : null;
          if (score != null) {
            onScore(s.id, score);
            try { localStorage.setItem(k, JSON.stringify({ score, t: Date.now() })); } catch {}
          }
        } catch {}
        finally {
          inflight.delete(s.id);
        }
      }
    })());
  }
  await Promise.all(workers);
}
