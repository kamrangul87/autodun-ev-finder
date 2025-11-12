// components/admin/CouncilLayer.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { GeoJSON } from "react-leaflet";
import type { GeoJSON as GeoJSONType } from "geojson";

type Props = {
  councilCode?: string;           // optional: preselect by code
  geojsonUrl?: string;            // optional: override source
};

export default function CouncilLayer({ councilCode, geojsonUrl }: Props) {
  const [data, setData] = useState<GeoJSONType | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url = geojsonUrl ?? "/api/council?mode=polygons"; // your existing endpoint
        const r = await fetch(url);
        const j = (await r.json()) as GeoJSONType;
        if (!alive) return;
        setData(j);
      } catch {}
    })();
    return () => { alive = false; };
  }, [geojsonUrl]);

  const filtered = useMemo<GeoJSONType | null>(() => {
    if (!data) return null;
    if (!councilCode) return data;
    const feats = (data as any).features?.filter((f: any) => f.properties?.code === councilCode) ?? [];
    return { type: "FeatureCollection", features: feats } as any;
  }, [data, councilCode]);

  if (!filtered) return null;
  return (
    <GeoJSON
      data={filtered}
      style={() => ({ color: "#2563eb", weight: 1.2, fillColor: "#3b82f6", fillOpacity: 0.08 })}
    />
  );
}
