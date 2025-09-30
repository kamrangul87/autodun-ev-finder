'use client';

import React, { useMemo } from 'react';
import { LayerGroup, CircleMarker } from 'react-leaflet';

export type HeatPoint = { lat: number; lng: number; value: number };

type Props = {
  points: HeatPoint[];
  intensity?: number; // default 1
  radius?: number;    // default 18
  blur?: number;      // 0..1, default 0.35
};

export default function HeatmapWithScaling({ points, intensity = 1, radius = 18, blur = 0.35 }: Props) {
  const safe = useMemo(
    () =>
      (Array.isArray(points) ? points : [])
        .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.value))
        .slice(0, 5000),
    [points]
  );

  if (!safe.length) return null;

  const baseOpacity = 0.18 + Math.max(0, Math.min(1, blur)) * 0.22; // 0.18..0.40

  return (
    <LayerGroup>
      {safe.map((p, i) => {
        const v = Math.max(0.5, Math.min(10, p.value * intensity));
        const r = Math.max(6, Math.min(50, radius * v));
        const op = Math.min(0.55, baseOpacity * (0.65 + v * 0.1));
        const color =
          v < 2 ? '#ffe08a' : v < 4 ? '#ffc46b' : v < 6 ? '#ff9c46' : v < 8 ? '#ff7a2e' : '#ff5a1a';

        return (
          <CircleMarker
            key={i}
            center={[p.lat, p.lng]}
            radius={r}
            pathOptions={{ stroke: false, fillOpacity: op, fillColor: color }}
          />
        );
      })}
    </LayerGroup>
  );
}
