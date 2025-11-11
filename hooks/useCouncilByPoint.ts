"use client";

import { useEffect, useState } from "react";

export type CouncilFeature = {
  type: "Feature";
  properties: { id: number; name: string; code: string };
  geometry: any;
};

export function useCouncilByPoint(lat?: number | null, lng?: number | null) {
  const [loading, setLoading] = useState(false);
  const [feature, setFeature] = useState<CouncilFeature | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) {
        setFeature(null);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const r = await fetch(`/api/council?mode=point&lat=${lat}&lng=${lng}`, { cache: "no-store" });
        const data = await r.json();
        if (cancelled) return;
        // supports both {ok:true,feature} or {items:[...]} versions
        const f = data?.feature ?? data?.items?.[0] ?? null;
        setFeature(f || null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to fetch council");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [lat, lng]);

  return { loading, feature, error };
}
