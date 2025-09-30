'use client';

import React, { useMemo } from 'react';
import { LayerGroup, CircleMarker } from 'react-leaflet';

export type HeatPoint = { lat: number; lng: number; value: number };

type Props = {
  points: HeatPoint[];
  /** Multiplier for how “strong” each point looks (default 1) */
  intensity?: number;
  /** Base radius in pixels (default 18) */
  radius?: number;
  /** Cosmetic softening; we map it into opacity (0..1); default 0.35 */
  blur?: number;
};

export default function HeatmapWithScaling({
  points,
  intensity = 1,
  radius = 18,
  blur = 0.35,
}: Props) {
  const safePoints = useMemo(
    () =>
      (Array.isArray(points) ? points : [])
        .filter(
          (p) =>
            p &&
            typeof p.lat === 'number' &&
            typeof p.lng === 'number' &&
            Number.isFinite(p.lat) &&
            Number.isFinite(p.lng) &&
            typeof p.value === 'number' &&
            Number.isFinite(p.value)
        )
        .slice(0, 5000), // hard cap just in case
    [points]
  );

  if (safePoints.length === 0) return null;

  const clampedBlur = Math.max(0, Math.min(1, blur));
  const baseOpacity = 0.18 + clampedBlur * 0.22; // 0.18..0.40

  return (
    <LayerGroup>
      {safePoints.map((p, i) => {
        // scale radius & opacity by value * intensity (with clamps)
        const v = Math.max(0.5, Math.min(10, p.value * intensity));
        const r = Math.max(6, Math.min(50, radius * v));
        const op = Math.min(0.55, baseOpacity * (0.65 + v * 0.1));

        // warm color ramp
        // small v -> soft yellow; big v -> deeper orange/red
        const color =
          v < 2 ? '#ffe08a' : v < 4 ? '#ffc46b' : v < 6 ? '#ff9c46' : v < 8 ? '#ff7a2e' : '#ff5a1a';

        return (
          <CircleMarker
            key={i}
            center={[p.lat, p.lng]}
            radius={r}
            pathOptions={{
              stroke: false,
              fillOpacity: op,
              fillColor: color,
            }}
          />
        );
      })}
    </LayerGroup>
  );
}
