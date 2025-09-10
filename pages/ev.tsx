import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import fallbackPoints from "../data/evPoints";

const HeatmapWithScaling = dynamic(() => import("../components/HeatmapWithScaling"), {
  ssr: false,
});

export default function EvPage() {
  const [points, setPoints] = useState(fallbackPoints);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const r = await fetch("/api/ev-points");
        const data = await r.json();
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setPoints(data);
        }
      } catch (e) {
        console.warn("Using fallback points because API fetch failed:", e);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  return (
    <main style={{ padding: 16 }}>
      <HeatmapWithScaling points={points} defaultScale="robust" />
    </main>
  );
}
