// pages/ev.tsx
import React from "react";
import dynamic from "next/dynamic";
import type { Point } from "../components/HeatmapWithScaling";

const HeatmapWithScaling = dynamic(() => import("../components/HeatmapWithScaling"), { ssr: false });

export default function EVPage() {
  const [points, setPoints] = React.useState<Point[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Live controls for API time-decay (days)
  const [halfReports, setHalfReports] = React.useState<number>(90);
  const [halfDown, setHalfDown] = React.useState<number>(60);

  const fetchData = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const url = `/api/ev-points?halfReports=${halfReports}&halfDown=${halfDown}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`API ${r.status}`);
      const data = await r.json();
      setPoints(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [halfReports, halfDown]);

  React.useEffect(() => {
    fetchData();
  }, []); // initial load

  return (
    <div style={{ position: "relative" }}>
      {/* Top-right controls/badge */}
      <div style={{
        position: "absolute", right: 16, top: 12, zIndex: 1100,
        background: "rgba(255,255,255,0.95)", padding: "8px 10px",
        borderRadius: 12, boxShadow: "0 2px 10px rgba(0,0,0,0.08)", fontSize: 12, display: "flex", gap: 10, alignItems: "center"
      }}>
        <div><b>Live OCM data</b> • {points.length.toLocaleString()} points</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label>Reports HL</label>
          <input
            type="number" min={7} max={365} step={1} value={halfReports}
            onChange={e => setHalfReports(Math.max(7, Math.min(365, +e.target.value || 0)))}
            style={{ width: 60 }}
            title="Half-life for Reports (days)"
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label>Downtime HL</label>
          <input
            type="number" min={7} max={365} step={1} value={halfDown}
            onChange={e => setHalfDown(Math.max(7, Math.min(365, +e.target.value || 0)))}
            style={{ width: 60 }}
            title="Half-life for Downtime (days)"
          />
        </div>
        <button
          onClick={() => fetchData()}
          style={{
            border: "1px solid #ddd", background: "#f8fafc", borderRadius: 10, padding: "6px 10px",
            cursor: "pointer"
          }}
          title="Refetch using these half-lives"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div style={{ height: "80vh", display: "grid", placeItems: "center" }}>
          <span>Loading live EV data…</span>
        </div>
      )}

      {error && (
        <div style={{ height: "80vh", display: "grid", placeItems: "center", color: "#b91c1c" }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Failed to load</div>
            <code>{error}</code>
          </div>
        </div>
      )}

      {!loading && !error && (
        <HeatmapWithScaling
          points={points}
          // pass current half-lives for inclusion in CSV metadata
          meta={{ halfReports, halfDown }}
        />
      )}
    </div>
  );
}
