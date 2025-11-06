import { useEffect, useMemo, useState } from "react";

/* =========================
   Types (your existing API)
   ========================= */

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

/* =========================
   Small derived type for map/charts
   ========================= */
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

/* =========================
   Page Component
   ========================= */

export default function AdminFeedback() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);

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

  /* ---------- Adapt rows -> points (for map & charts) ---------- */
  const points: FeedbackPoint[] = useMemo(() => {
    function toSentiment(vote?: string | null): "positive" | "neutral" | "negative" | undefined {
      const v = (vote || "").toLowerCase();
      if (v === "good" || v === "up" || v === "positive") return "positive";
      if (v === "bad" || v === "down" || v === "negative") return "negative";
      return v ? "neutral" : undefined;
    }
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

  return (
    <div
      style={{
        padding: 18,
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
        Autodun Admin · Feedback
      </h1>

      {/* KPI row (unchanged) */}
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <StatCard label="Total" value={fmt(stats?.total)} />
        <StatCard label="Good" value={fmt(stats?.good)} />
        <StatCard label="Bad" value={fmt(stats?.bad)} />
        <StatCard label="% Good" value={pct(stats?.goodPct)} />
        <StatCard label="Avg ML Score" value={score(stats?.avgScore)} />
        <button onClick={load} style={refreshBtn}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Timeline (unchanged) */}
      <div style={panel}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          Timeline (last {stats?.timeline?.length ?? 0} days)
        </div>
        {!stats || !stats.timeline.length ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>No data yet.</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr 120px",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, color: "#6b7280" }}>Date</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Bar (count)</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Avg ML</div>
            {stats.timeline.map((d) => (
              <FragmentRow key={d.day} day={d.day} count={d.count} avg={d.avgScore} />
            ))}
          </div>
        )}
      </div>

      {/* NEW: Map panel */}
      <div style={panel}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Feedback Map</div>
        <div style={{ width: "100%", height: 420, borderRadius: 12, overflow: "hidden" }}>
          <FeedbackMap points={points} />
        </div>
      </div>

      {/* NEW: Charts panel */}
      <div style={panel}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Analytics</div>
        <FeedbackCharts points={points} />
      </div>

      {/* Table (unchanged) */}
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
              {rows.slice(0, 200).map((r, i) => (
                <tr key={i}>
                  <td>{r.ts ? new Date(r.ts).toLocaleString() : "—"}</td>
                  <td>{r.stationId ?? "—"}</td>
                  <td
                    style={{
                      fontWeight: 700,
                      color:
                        r.vote === "good" || r.vote === "up" ? "#166534" : "#991b1b",
                    }}
                  >
                    {r.vote || "—"}
                  </td>
                  <td>{typeof r.mlScore === "number" ? r.mlScore.toFixed(3) : "—"}</td>
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
                  <td>
                    {Number.isFinite(r.lat ?? NaN) ? r.lat!.toFixed(6) : "—"}
                  </td>
                  <td>
                    {Number.isFinite(r.lng ?? NaN) ? r.lng!.toFixed(6) : "—"}
                  </td>
                  <td>{r.modelVersion || "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
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

/* =========================================
   Map Component (inline, no separate files)
   ========================================= */
import { MapContainer, TileLayer, Marker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

if (typeof window !== "undefined") {
  // @ts-ignore
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

function ScoreBadge({ value }: { value?: number }) {
  if (typeof value !== "number" || !isFinite(value)) return null;
  const s = Math.round(value);
  const tone =
    s >= 70
      ? { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" }
      : s >= 40
      ? { bg: "#fef9c3", text: "#854d0e", border: "#fde68a" }
      : { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      ML {s}
    </span>
  );
}

function FeedbackMap({ points }: { points: FeedbackPoint[] }) {
  const center: [number, number] =
    points.length ? [points[0].lat, points[0].lng] : [52.3555, -1.1743];

  return (
    <MapContainer center={center} zoom={6} scrollWheelZoom style={{ width: "100%", height: "100%" }}>
      <TileLayer
        attribution="&copy; OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]}>
          <Tooltip direction="top" offset={[0, -6]} opacity={1}>
            <div style={{ fontSize: 12 }}>
              <div style={{ fontWeight: 700 }}>{p.stationName ?? "Station"}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 4, marginBottom: 4 }}>
                <ScoreBadge value={p.mlScore} />
                {p.sentiment && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      background: "#f5f5f5",
                    }}
                  >
                    {p.sentiment}
                  </span>
                )}
              </div>
              {p.source && <div>Source: {p.source}</div>}
              {p.createdAt && (
                <div style={{ opacity: 0.7 }}>{p.createdAt}</div>
              )}
            </div>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}

/* =========================================
   Charts (inline, no separate files)
   ========================================= */
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip as CTooltip,
  Legend,
  TimeScale,
} from "chart.js";
import { Pie, Bar, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  CTooltip,
  Legend,
  TimeScale
);

function FeedbackCharts({ points }: { points: FeedbackPoint[] }) {
  // sentiment from vote-derived field
  const sentiments: Array<"positive" | "neutral" | "negative"> = [
    "positive",
    "neutral",
    "negative",
  ];
  const sentimentCounts = sentiments.map(
    (s) => points.filter((p) => p.sentiment === s).length
  );

  // sources
  const sourceCount = new Map<string, number>();
  for (const p of points) {
    const k = p.source ?? "unknown";
    sourceCount.set(k, (sourceCount.get(k) ?? 0) + 1);
  }
  const sourceLabels = Array.from(sourceCount.keys());
  const sourceValues = Array.from(sourceCount.values());

  // average score by day
  const byDay = new Map<string, number[]>();
  for (const p of points) {
    if (!p.createdAt) continue;
    const d = p.createdAt.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    if (typeof p.mlScore === "number") byDay.get(d)!.push(p.mlScore);
  }
  const dayLabels = Array.from(byDay.keys()).sort();
  const dayAverages = dayLabels.map((d) => {
    const arr = byDay.get(d)!;
    const avg = arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
    return Math.round(avg * 100) / 100;
    // if your mlScore is 0..1, change rounding accordingly
  });

  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: "1fr",
      }}
    >
      {/* Sentiment */}
      <div style={chartPanel}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Sentiment Breakdown</div>
        <Pie
          data={{
            labels: ["Positive", "Neutral", "Negative"],
            datasets: [{ data: sentimentCounts }],
          }}
        />
      </div>

      {/* Sources */}
      <div style={chartPanel}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Feedback by Source</div>
        <Bar
          data={{
            labels: sourceLabels,
            datasets: [{ label: "Count", data: sourceValues }],
          }}
          options={{ responsive: true, maintainAspectRatio: false }}
        />
      </div>

      {/* Average score over time */}
      <div style={chartPanel}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Avg ML Score by Day</div>
        <Line
          data={{
            labels: dayLabels,
            datasets: [{ label: "Avg Score", data: dayAverages }],
          }}
          options={{ responsive: true, maintainAspectRatio: false }}
        />
      </div>
    </div>
  );
}

/* ——— components & styles you already had ——— */

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

function FragmentRow({
  day,
  count,
  avg,
}: {
  day: string;
  count: number;
  avg: number | null;
}) {
  const width = Math.min(360, 16 * count);
  return (
    <>
      <div style={{ fontSize: 13 }}>{day}</div>
      <div style={{ height: 10, background: "#f3f4f6", borderRadius: 999 }}>
        <div
          style={{
            height: 10,
            width,
            background: "#2563eb",
            borderRadius: 999,
          }}
        />
      </div>
      <div style={{ fontSize: 13 }}>{avg == null ? "—" : avg.toFixed(3)}</div>
    </>
  );
}

/* ——— styles ——— */
const panel: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 12,
};

const chartPanel: React.CSSProperties = {
  padding: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
  borderRadius: 12,
  minHeight: 260,
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
