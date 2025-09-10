// pages/ev.tsx
import React from "react";
import dynamic from "next/dynamic";
import type { Point } from "../components/HeatmapWithScaling";

const HeatmapWithScaling = dynamic(() => import("../components/HeatmapWithScaling"), { ssr: false });

export default function EVPage() {
  const [points, setPoints] = React.useState<Point[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const url = "/api/ev-points"; // tweak query params here if you like
    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`API ${r.status}`);
        const data = await r.json();
        setPoints(data);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div style={{ position: "relative" }}>
      {/* top-right badge */}
      <div style={{
        position: "absolute", right: 16, top: 12, zIndex: 1100,
        background: "rgba(255,255,255,0.95)", padding: "6px 10px",
        borderRadius: 999, boxShadow: "0 2px 10px rgba(0,0,0,0.08)", fontSize: 12
      }}>
        Live OCM data • {points.length.toLocaleString()} points
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

      {!loading && !error && <HeatmapWithScaling points={points} />}
    </div>
  );
}
