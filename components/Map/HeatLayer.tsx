"use client";
import { useEffect } from "react";
import { useMap } from "react-leaflet";

type HeatPoint = [number, number, number?]; // [lat, lng, intensity]

export default function HeatLayer({
  points,
  radius = 30,
  blur = 20,
  max = 1.0,
}: { points: HeatPoint[]; radius?: number; blur?: number; max?: number }) {
  const map = useMap();
  useEffect(() => {
    let layer: any;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.heat"); // augments L
      if (cancelled) return;
      layer = (L as any).heatLayer(points, { radius, blur, max });
      layer.addTo(map);
    })();
    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, points, radius, blur, max]);
  return null;
}
