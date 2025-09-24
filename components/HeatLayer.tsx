'use client';

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";

type HeatPoint = [number, number, number];

export default function HeatLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default as any;
      await import("leaflet.heat");

      if (cancelled || !map) return;

      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }

      if (!points.length) return;

      const layer = (L as any).heatLayer(points as LatLngExpression[], {
        radius: 45,
        blur: 25,
        maxZoom: 17,
        max: 1.0,
        minOpacity: 0.35,
      });
      layer.addTo(map);
      layerRef.current = layer;
    })();

    return () => {
      cancelled = true;
      if (layerRef.current && map) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
    };
  }, [map, points]);

  return null;
}
