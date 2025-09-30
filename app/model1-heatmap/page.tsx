'use client';

export const dynamic = 'force-dynamic'; // disable prerender/SSG for this page

import dynamicImport from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';

// Load the map only on the client (no SSR), avoids "window is not defined"
const ClientMap = dynamicImport(() => import('@/components/ClientMap'), {
  ssr: false,
});

const DEFAULT_CENTER: [number, number] = [51.509, -0.118];
const DEFAULT_ZOOM = 12;

// ----- URL helpers -----
function readNumber(sp: URLSearchParams, key: string, dflt: number) {
  const v = Number(sp.get(key));
  return Number.isFinite(v) ? v : dflt;
}
function readBool(sp: URLSearchParams, key: string, dflt: boolean) {
  const v = sp.get(key);
  return v === null ? dflt : v === '1' || v === 'true';
}
function setParam(sp: URLSearchParams, key: string, val: any) {
  if (val === undefined || val === null) sp.delete(key);
  else sp.set(key, String(val));
}

export default function Model1HeatmapPage() {
  const sp0 =
    typeof window !== 'undefined'
      ? new URLSearchParams(location.search)
      : new URLSearchParams();

  const [showHeatmap, setShowHeatmap] = useState(() => readBool(sp0, 'hm', true));
  const [showMarkers, setShowMarkers] = useState(() => readBool(sp0, 'mk', true));
  const [showCouncil, setShowCouncil] = useState(() => readBool(sp0, 'co', true));
  const [stationsCount, setStationsCount] = useState(0);

  // sliders for heatmap look
  const [heatRadius, setHeatRadius] = useState(() => readNumber(sp0, 'r', 45));
  const [heatBlur, setHeatBlur] = useState(() => readNumber(sp0, 'b', 25));
  const [heatIntensity, setHeatIntensity] = useState(() => readNumber(sp0, 'i', 1));

  // sync controls -> URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(location.search);
    setParam(sp, 'hm', showHeatmap ? 1 : 0);
    setParam(sp, 'mk', showMarkers ? 1 : 0);
    setParam(sp, 'co', showCouncil ? 1 : 0);
    setParam(sp, 'r', heatRadius);
    setParam(sp, 'b', heatBlur);
    setParam(sp, 'i', heatIntensity);
    const url = `${location.pathname}?${sp.toString()}`;
    history.replaceState(null, '', url);
  }, [showHeatmap, showMarkers, showCouncil, heatRadius, heatBlur, heatIntensity]);

  const heatOptions = useMemo(
    () => ({
      radius: heatRadius,
      blur: heatBlur,
      minOpacity: 0.35,
      intensity: heatIntensity,
    }),
    [heatRadius, heatBlur, heatIntensity],
  );

  return (
    <div className="relative">
      {/* Controls bar */}
      <div className="absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-md bg-white/90 shadow px-3 py-2 text-sm flex items-center gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showHeatmap}
            onChange={(e) => setShowHeatmap(e.target.checked)}
          />
          <span>Heatmap</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showMarkers}
            onChange={(e) => setShowMarkers(e.target.checked)}
          />
          <span>Markers</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showCouncil}
            onChange={(e) => setShowCouncil(e.target.checked)}
          />
          <span>Council</span>
        </label>

        {/* sliders */}
        <div className="flex items-center gap-2">
          <span className="opacity-70">Radius</span>
          <input
            type="range"
            min={10}
            max={80}
            value={heatRadius}
            onChange={(e) => setHeatRadius(Number(e.target.value))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="opacity-70">Blur</span>
          <input
            type="range"
            min={5}
            max={50}
            value={heatBlur}
            onChange={(e) => setHeatBlur(Number(e.target.value))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="opacity-70">Intensity</span>
          <input
            type="range"
            min={0.2}
            max={2}
            step={0.1}
            value={heatIntensity}
            onChange={(e) => setHeatIntensity(Number(e.target.value))}
          />
        </div>

        <span className="opacity-70">stations: {stationsCount}</span>
      </div>

      <ClientMap
        initialCenter={DEFAULT_CENTER}
        initialZoom={DEFAULT_ZOOM}
        showHeatmap={showHeatmap}
        showMarkers={showMarkers}
        showCouncil={showCouncil}
        onStationsCount={setStationsCount}
        heatOptions={heatOptions}
      />
    </div>
  );
}
