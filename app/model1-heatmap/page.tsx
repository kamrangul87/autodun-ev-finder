'use client';

export const dynamic = 'force-dynamic'; // disable prerender/SSG

import dynamicImport from 'next/dynamic';
import { useMemo, useState } from 'react';

// Load the map only on the client (no SSR)
const ClientMap = dynamicImport(() => import('@/components/ClientMap'), { ssr: false });

const DEFAULT_CENTER: [number, number] = [51.509, -0.118];
const DEFAULT_ZOOM = 12;

/** helpers to read query params (client only) */
function getSearch(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}
function readBool(sp: URLSearchParams, key: string, fallback: boolean) {
  const v = sp.get(key);
  if (v === null) return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}
function readNum(sp: URLSearchParams, key: string, fallback: number, min = 0, max = 1) {
  const raw = sp.get(key);
  const n = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export default function Model1HeatmapPage() {
  const search = useMemo(getSearch, []);

  // UI state (initialised from URL once)
  const [showHeatmap, setShowHeatmap] = useState(() => readBool(search, 'hm', true));
  const [showMarkers, setShowMarkers] = useState(() => readBool(search, 'mk', true));
  const [showCouncil, setShowCouncil] = useState(() => readBool(search, 'co', true));

  const [heatRadius, setHeatRadius] = useState(() => readNum(search, 'r', 28, 6, 60));
  const [heatBlur, setHeatBlur] = useState(() => readNum(search, 'b', 25, 6, 60));
  const [heatIntensity, setHeatIntensity] = useState(() => readNum(search, 'i', 0.5, 0.1, 1));

  const [stationsCount, setStationsCount] = useState(0);

  return (
    <div className="relative">
      {/* Top toolbar — centered, wraps, high z-index so it sits above popups */}
      <div
        className="
          absolute left-1/2 -translate-x-1/2 top-3 z-[1200]
          max-w-[min(1100px,calc(100%-16px))]
          rounded-xl bg-white/95 shadow-lg backdrop-blur
          px-3 py-2
        "
        style={{ pointerEvents: 'auto' }}
      >
        <div className="flex flex-wrap items-center gap-4">
          {/* Toggles */}
          <label className="flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
            />
            Heatmap
          </label>
          <label className="flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={showMarkers}
              onChange={(e) => setShowMarkers(e.target.checked)}
            />
            Markers
          </label>
          <label className="flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={showCouncil}
              onChange={(e) => setShowCouncil(e.target.checked)}
            />
            Council
          </label>

          {/* Sliders (compact widths so they don’t overrun) */}
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-70">Radius</span>
            <input
              className="w-28 md:w-40"
              type="range"
              min={6}
              max={60}
              value={heatRadius}
              onChange={(e) => setHeatRadius(Number(e.target.value))}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm opacity-70">Blur</span>
            <input
              className="w-28 md:w-40"
              type="range"
              min={6}
              max={60}
              value={heatBlur}
              onChange={(e) => setHeatBlur(Number(e.target.value))}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm opacity-70">Intensity</span>
            <input
              className="w-28 md:w-40"
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={heatIntensity}
              onChange={(e) => setHeatIntensity(Number(e.target.value))}
            />
          </div>

          <span className="ml-auto text-sm opacity-70">stations: {stationsCount}</span>
        </div>
      </div>

      <ClientMap
        initialCenter={DEFAULT_CENTER}
        initialZoom={DEFAULT_ZOOM}
        showHeatmap={showHeatmap}
        showMarkers={showMarkers}
        showCouncil={showCouncil}
        onStationsCount={setStationsCount}
        heatOptions={{
          radius: heatRadius,
          blur: heatBlur,
          // We map intensity into the heat layer “max” to strengthen colors globally
          max: heatIntensity,
          minOpacity: 0.35,
        }}
      />
    </div>
  );
}
