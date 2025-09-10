import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import fallbackPoints from "../data/evPoints";

const HeatmapWithScaling = dynamic(() => import("../components/HeatmapWithScaling"), { ssr: false });

export default function EvPage() {
  const [points, setPoints] = useState(fallbackPoints);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/ev-points");
        const data = await r.json();
        if (mounted && Array.isArray(data) && data.length > 0) {
          setPoints(data);
          setIsLive(true);
        }
      } catch { /* keep fallback */ }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <main style={{ padding: 16, position: "relative" }}>
      <div style={{
        position: "absolute", right: 16, top: 16, zIndex: 1100,
        background: "rgba(255,255,255,0.9)", padding: "6px 10px",
        borderRadius: 10, boxShadow: "0 2px 10px rgba(0,0,0,0.1)", fontSize: 12
      }}>
        {isLive ? "Live OCM data" : "Fallback sample"} • {points.length} points
      </div>

      <HeatmapWithScaling points={points} defaultScale="robust" />
    </main>
  );
}
