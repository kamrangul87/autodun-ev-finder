'use client';

import React from 'react';

type Props = {
  showHeatmap: boolean;
  setShowHeatmap: (v: boolean) => void;

  showMarkers: boolean;
  setShowMarkers: (v: boolean) => void;

  showPolygons: boolean;
  setShowPolygons: (v: boolean) => void;

  intensity: number;
  setIntensity: (v: number) => void;

  radius: number;
  setRadius: (v: number) => void;

  blur: number;
  setBlur: (v: number) => void;
};

export default function Controls(p: Props) {
  return (
    <div className="rounded-2xl border bg-white shadow p-3 w-[280px] space-y-3">
      <div>
        <div className="text-sm font-semibold mb-1">Layers</div>

        <label className="flex items-center gap-2 py-1 text-sm">
          <input
            type="checkbox"
            checked={p.showHeatmap}
            onChange={(e) => p.setShowHeatmap(e.target.checked)}
          />
          <span>Heatmap</span>
        </label>

        <label className="flex items-center gap-2 py-1 text-sm">
          <input
            type="checkbox"
            checked={p.showMarkers}
            onChange={(e) => p.setShowMarkers(e.target.checked)}
          />
          <span>Markers</span>
        </label>

        <label className="flex items-center gap-2 py-1 text-sm">
          <input
            type="checkbox"
            checked={p.showPolygons}
            onChange={(e) => p.setShowPolygons(e.target.checked)}
          />
          <span>Polygons</span>
        </label>
      </div>

      <div>
        <div className="text-sm font-semibold mb-1">Heatmap</div>

        <div className="text-xs text-gray-600">
          Intensity: {Number.isFinite(p.intensity) ? p.intensity.toFixed(2) : p.intensity}
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={p.intensity}
          onChange={(e) => p.setIntensity(parseFloat(e.target.value))}
          className="w-full"
        />

        <div className="text-xs text-gray-600 mt-2">Radius: {Math.round(p.radius)}</div>
        <input
          type="range"
          min={1}
          max={50}
          step={1}
          value={p.radius}
          onChange={(e) => p.setRadius(parseInt(e.target.value))}
          className="w-full"
        />

        <div className="text-xs text-gray-600 mt-2">Blur: {Math.round(p.blur)}</div>
        <input
          type="range"
          min={0}
          max={50}
          step={1}
          value={p.blur}
          onChange={(e) => p.setBlur(parseInt(e.target.value))}
          className="w-full"
        />
      </div>
    </div>
  );
}
