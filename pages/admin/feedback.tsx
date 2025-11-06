import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

// Dynamic client-only components
const MapClient = dynamic(() => import("../../components/admin/MapClient"), { ssr: false });
const ChartsClient = dynamic(() => import("../../components/admin/ChartsClient"), { ssr: false });

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
    goodPct: number;    // 0..1
    avgScore: number | null;
    timeline: { day: string; count: number; avgScore: number | null }[];
  };
};

// lightweight point type (mirrors MapClient)
type FeedbackPoint = {
  id: string;
  stationName?: string;
  lat: number;
  lng: number;
  mlScore?: number;
  sentiment?: "positive" | "neutral" | "negative";
  source?: string;
  createdAt?: string;
};

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

  useEffect(() => { load(); }, []);

  const rows = data?.rows || [];
  const stats = data?.stats;

  // Adapt rows to map/chart points (client-safe)
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
          lat, lng,
          mlScore: typeof r.mlScore === "number" ? r.mlScore : undefined,
          sentiment: toSentiment(r.vote),
          source: r.source || undefined,
          createdAt: r.ts || undefined,
        } as FeedbackPoint;
      })
      .filter(Boolean) as FeedbackPoint[];
  }, [rows]);

  return (
    <div style={{ padding: 18, maxWidth: 1100, margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Autodun Admin · Feedback</h1>

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <StatCard label="Total" value={fmt(stats?.total)} />
        <StatCard label="Good" value={fmt(stats?.good)} />
        <StatCard label="Bad" value={fmt(stats?.bad)} />
        <StatCard label="% Good" value={pct(stats?.goodPct)} />
        <StatCard label="Avg ML Score" value={score(stats?.avgScore)} />
        <button onClick={load} style={refreshBtn}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>

      {/* Timeline (unchanged) */}
      <div style={panel}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Timeline (last {stats?.timeline?.length ?? 0} days)</div>
        {(!stats || !stats.timeline.length) ? (
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

      {/* NEW: Map */}
      <div style={panel}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Feedback Map</div>
        <div style={{ width: "100%", height: 420, borderRadius: 12, overflow: "hidden" }}>
          <MapClient points={points} />
        </div>
      </div>

      {/* NEW: Charts */}
      <div style={panel}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Analytics</div>
        <ChartsClient points={points} />
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
                  <td style={{ fontWeight: 700, color: r.vote === "good" || r.vote === "up" ? "#166534" : "#991b1b" }}>
                    {r.vote || "—"}
                  </td>
                  <td>{typeof r.mlScore === "number" ? r.mlScore.toFixed(3) : "—"}</td>
                  <td style={{ maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.comment || "—"}
                  </td>
                  <td>{r.source || "—"}</td>
                  <td>{Number.isFinite(r.lat ?? NaN) ? r.lat!.toFixed(6) : "—"}</td>
                  <td>{Number.isFinite(r.lng ?? NaN) ? r.lng!.toFixed(6) : "—"}</td>
                  <td>{r.modelVersion || "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} style={{ color: "#6b7280", textAlign: "center" }}>No rows</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ——— components & styles you already had ——— */

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "10px 12px", border: "1px solid #e5e7eb", background: "#fff", borderRadius: 12, minWidth: 140 }}>
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

/* tiny utils */
function fmt(n?: number | null) { return (n ?? 0).toLocaleString(); }
function pct(p?: number | null) { return p == null ? "—" : `${Math.round(p * 100)}%`; }
function score(s?: number | null) { return s == null ? "—" : s.toFixed(3); }
