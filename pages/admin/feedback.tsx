import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

/* ──────────────────────────────────────────────────────────────
   Client-only components (avoid SSR “window is not defined”)
   ────────────────────────────────────────────────────────────── */
const MapClient = dynamic(() => import("../../components/admin/MapClient"), { ssr: false });
const ChartsClient = dynamic(() => import("../../components/admin/ChartsClient"), { ssr: false });

/* ──────────────────────────────────────────────────────────────
   Types (matches your API)
   ────────────────────────────────────────────────────────────── */
type Row = {
  ts: string | null;
  stationId: string | number | null;
  vote: string;
  comment: string;
  source: string;
  lat: number | null;
  lng: number | null;
  mlScore: number | null;
  modelVersion: string;
  userAgent: string;
};

type ApiData = {
  ok: boolean;
  rows: Row[];
  stats: {
    total: number;
    good: number;
    bad: number;
    goodPct: number; // 0..1
    avgScore: number | null;
    timeline: { day: string; count: number; avgScore: number | null }[];
  };
};

/* Lightweight point used for map/charts */
type FeedbackPoint = {
  id: string;
  stationName?: string;
  lat: number;
  lng: number;
  mlScore?: number;
  sentiment?: "positive" | "neutral" | "negative";
  source?: string;
  createdAt?: string; // ISO
};

/* Filters/sort */
type Sentiment = "all" | "positive" | "neutral" | "negative";
type SortKey = "recent" | "oldest" | "scoreHigh" | "scoreLow";

/* Score badge color helper */
function badgeColor(score?: number) {
  if (typeof score !== "number" || !isFinite(score))
    return { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb", label: "—" };
  const s = Math.round(score);
  if (s >= 70) return { bg: "#dcfce7", text: "#166534", border: "#bbf7d0", label: `ML ${s}` };
  if (s >= 40) return { bg: "#fef9c3", text: "#854d0e", border: "#fde68a", label: `ML ${s}` };
  return { bg: "#fee2e2", text: "#991b1b", border: "#fecaca", label: `ML ${s}` };
}

/* ──────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────── */
export default function AdminFeedback() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);

  // filters
  const [sentiment, setSentiment] = useState<Sentiment>("all");
  const [scoreMin, setScoreMin] = useState<number>(0);
  const [scoreMax, setScoreMax] = useState<number>(100);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("recent");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/feedback");
      const j = await r.json();
      setData(j);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const rows = data?.rows || [];
  const stats = data?.stats;

  /* Adapt rows → points for map/charts */
  const points: FeedbackPoint[] = useMemo(() => {
    const toSentiment = (vote?: string | null): FeedbackPoint["sentiment"] => {
      const v = (vote || "").toLowerCase();
      if (v === "good" || v === "up" || v === "positive") return "positive";
      if (v === "bad" || v === "down" || v === "negative") return "negative";
      return v ? "neutral" : undefined;
    };
    return rows
      .map((r, i) => {
        const lat = Number(r.lat);
        const lng = Number(r.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: String(r.stationId ?? i),
          stationName: r.stationId ? String(r.stationId) : undefined,
          lat,
          lng,
          mlScore: typeof r.mlScore === "number" ? r.mlScore : undefined,
          sentiment: toSentiment(r.vote),
          source: r.source || undefined,
          createdAt: r.ts || undefined,
        } as FeedbackPoint;
      })
      .filter(Boolean) as FeedbackPoint[];
  }, [rows]);

  /* Apply filters & sorting (table) */
  const filteredRows = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    const needle = q.trim().toLowerCase();

    let out = rows.filter((r) => {
      // sentiment
      if (sentiment !== "all") {
        const v = (r.vote || "").toLowerCase();
        const s = v === "good" || v === "up" ? "positive" : v === "bad" || v === "down" ? "negative" : "neutral";
        if (s !== sentiment) return false;
      }
      // score range
      if (Number.isFinite(r.mlScore ?? NaN)) {
        const s = r.mlScore as number;
        if (s < scoreMin || s > scoreMax) return false;
      } else if (scoreMin > 0) return false;

      // date range
      if (from || to) {
        const t = r.ts ? new Date(r.ts) : null;
        if (from && (!t || t < from)) return false;
        if (to && (!t || t > to)) return false;
      }

      // search
      if (needle) {
        const hay = [
          r.comment ?? "",
          String(r.stationId ?? ""),
          r.source ?? "",
          r.vote ?? "",
          r.modelVersion ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }

      return true;
    });

    // sorting
    out.sort((a, b) => {
      if (sort === "recent") return new Date(b.ts ?? 0).getTime() - new Date(a.ts ?? 0).getTime();
      if (sort === "oldest") return new Date(a.ts ?? 0).getTime() - new Date(b.ts ?? 0).getTime();
      if (sort === "scoreHigh") return (b.mlScore ?? -Infinity) - (a.mlScore ?? -Infinity);
      if (sort === "scoreLow") return (a.mlScore ?? Infinity) - (b.mlScore ?? Infinity);
      return 0;
    });

    return out;
  }, [rows, sentiment, scoreMin, scoreMax, dateFrom, dateTo, q, sort]);

  /* Keep map/charts in sync with filtered table */
  const filteredPoints: FeedbackPoint[] = useMemo(() => {
    if (!filteredRows.length) return points;
    // Simple join key: station + timestamp (fallback to index)
    const set = new Set(filteredRows.map((r, i) => `${r.stationId}|${r.ts ?? i}`));
    return points.filter((p, i) => set.has(`${p.stationName ?? ""}|${p.createdAt ?? i}`));
  }, [points, filteredRows]);

  /* ── CSV Export (filtered rows) ─────────────────────────────── */
  function escapeCSV(v: unknown): string {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  function toISO(ts: string | null): string {
    try { return ts ? new Date(ts).toISOString() : ""; } catch { return ts ?? ""; }
  }
  function buildCSV(rowsIn: Row[]): string {
    const header = [
      "time_iso",
      "station",
      "vote",
      "mlScore",
      "comment",
      "source",
      "lat",
      "lng",
      "model",
      "userAgent",
    ];
    const body = rowsIn.map((r) => [
      toISO(r.ts),
      r.stationId ?? "",
      r.vote ?? "",
      r.mlScore ?? "",
      r.comment ?? "",
      r.source ?? "",
      Number.isFinite(r.lat ?? NaN) ? (r.lat as number).toFixed(6) : "",
      Number.isFinite(r.lng ?? NaN) ? (r.lng as number).toFixed(6) : "",
      r.modelVersion ?? "",
      r.userAgent ?? "",
    ]);
    const lines = [header, ...body].map((arr) => arr.map(escapeCSV).join(",")).join("\n");
    // Add BOM so Excel opens UTF-8 correctly
    return "\uFEFF" + lines;
  }
  function downloadCSV() {
    const csv = buildCSV(filteredRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `feedback-export-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: 18, maxWidth: 1100, margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Autodun Admin · Feedback</h1>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <StatCard label="Total" value={fmt(stats?.total)} />
        <StatCard label="Good" value={fmt(stats?.good)} />
        <StatCard label="Bad" value={fmt(stats?.bad)} />
        <StatCard label="% Good" value={pct(stats?.goodPct)} />
        <StatCard label="Avg ML Score" value={score(stats?.avgScore)} />
        <button onClick={load} style={refreshBtn}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>

      {/* Filters */}
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontWeight: 800 }}>Filters</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => {
                setSentiment("all");
                setScoreMin(0);
                setScoreMax(100);
                setDateFrom("");
                setDateTo("");
                setQ("");
                setSort("recent");
              }}
              style={refreshBtn}
            >
              Reset
            </button>
            <button onClick={downloadCSV} style={primaryBtn}>Export CSV</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 10 }}>
          {/* Sentiment */}
          <div>
            <div style={label}>Sentiment</div>
            <select value={sentiment} onChange={(e) => setSentiment(e.target.value as Sentiment)} style={input}>
              <option value="all">All</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </div>

          {/* Score min */}
          <div>
            <div style={label}>Score ≥</div>
            <input
              type="number"
              min={0}
              max={100}
              value={scoreMin}
              onChange={(e) => setScoreMin(Number(e.target.value) || 0)}
              style={input}
            />
          </div>

          {/* Score max */}
          <div>
            <div style={label}>Score ≤</div>
            <input
              type="number"
              min={0}
              max={100}
              value={scoreMax}
              onChange={(e) => setScoreMax(Number(e.target.value) || 100)}
              style={input}
            />
          </div>

          {/* From */}
          <div>
            <div style={label}>From</div>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={input} />
          </div>

          {/* To */}
          <div>
            <div style={label}>To</div>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={input} />
          </div>

          {/* Search */}
          <div>
            <div style={label}>Search</div>
            <input
              placeholder="comment / station / source"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={input}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
          <div>
            <div style={label}>Sort</div>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={input}>
              <option value="recent">Recent</option>
              <option value="oldest">Oldest</option>
              <option value="scoreHigh">Score: High → Low</option>
              <option value="scoreLow">Score: Low → High</option>
            </select>
          </div>
        </div>
      </div>

      {/* Timeline (as-is) */}
      <div style={panel}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          Timeline (last {stats?.timeline?.length ?? 0} days)
        </div>
        {!stats || !stats.timeline.length ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>No data yet.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 120px", gap: 8 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Date</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Bar (count)</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Avg ML</div>
            {stats.timeline.map((d) => (
              <FragmentRow key={d.day} day={d.day} count={d.count} avg={d.avgScore} />
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div style={panel}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Feedback Map</div>
        <div style={{ width: "100%", height: 420, borderRadius: 12, overflow: "hidden" }}>
          <MapClient points={filteredPoints} />
        </div>
      </div>

      {/* Charts */}
      <div style={panel}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Analytics</div>
        <ChartsClient points={filteredPoints} />
      </div>

      {/* Table */}
      <div style={panel}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Latest feedback</div>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Station</th>
                <th>Vote</th>
                <th>mlScore</th>
                <th>Comment</th>
                <th>Source</th>
                <th>Lat</th>
                <th>Lng</th>
                <th>Model</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 200).map((r, i) => (
                <tr key={i}>
                  <td>{r.ts ? new Date(r.ts).toLocaleString() : "—"}</td>
                  <td>{r.stationId ?? "—"}</td>
                  <td
                    style={{
                      fontWeight: 700,
                      color: r.vote === "good" || r.vote === "up" ? "#166534" : "#991b1b",
                    }}
                  >
                    {r.vote || "—"}
                  </td>
                  <td>
                    {typeof r.mlScore === "number" ? (
                      (() => {
                        const c = badgeColor(r.mlScore);
                        return (
                          <span
                            style={{
                              display: "inline-flex",
                              padding: "2px 8px",
                              borderRadius: 999,
                              border: `1px solid ${c.border}`,
                              background: c.bg,
                              color: c.text,
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            {c.label}
                          </span>
                        );
                      })()
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    style={{
                      maxWidth: 360,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.comment || "—"}
                  </td>
                  <td>{r.source || "—"}</td>
                  <td>{Number.isFinite(r.lat ?? NaN) ? r.lat!.toFixed(6) : "—"}</td>
                  <td>{Number.isFinite(r.lng ?? NaN) ? r.lng!.toFixed(6) : "—"}</td>
                  <td>{r.modelVersion || "—"}</td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ color: "#6b7280", textAlign: "center" }}>
                    No rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Small presentational pieces
   ────────────────────────────────────────────────────────────── */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        border: "1px solid #e5e7eb",
        background: "#fff",
        borderRadius: 12,
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function FragmentRow({ day, count, avg }: { day: string; count: number; avg: number | null }) {
  const width = Math.min(360, 16 * count);
  return (
    <>
      <div style={{ fontSize: 13 }}>{day}</div>
      <div style={{ height: 10, background: "#f3f4f6", borderRadius: 999 }}>
        <div style={{ height: 10, width, background: "#2563eb", borderRadius: 999 }} />
      </div>
      <div style={{ fontSize: 13 }}>{avg == null ? "—" : avg.toFixed(3)}</div>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────
   Styles
   ────────────────────────────────────────────────────────────── */
const panel: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 12,
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
};

const refreshBtn: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "#fff",
  borderRadius: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const label: React.CSSProperties = { fontSize: 12, color: "#6b7280", marginBottom: 4 };

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "#fff",
};

/* tiny utils */
function fmt(n?: number | null) {
  return (n ?? 0).toLocaleString();
}
function pct(p?: number | null) {
  return p == null ? "—" : `${Math.round(p * 100)}%`;
}
function score(s?: number | null) {
  return s == null ? "—" : s.toFixed(3);
}
