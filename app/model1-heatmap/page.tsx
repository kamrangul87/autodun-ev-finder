'use client';

export const dynamic = 'force-dynamic';

import dynamicImport from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';

/** Load map only on the client (avoid “window is not defined”). */
const ClientMap = dynamicImport(() => import('@/components/ClientMap'), { ssr: false });

const DEFAULT_CENTER: [number, number] = [51.509, -0.118];
const DEFAULT_ZOOM = 12;

/* ---------- Safe search-params helpers ---------- */
/** Accept URLSearchParams, Next’s ReadonlyURLSearchParams, or null. */
type AnySearch =
  | URLSearchParams
  | {
      get: (key: string) => string | null;
    }
  | null;

function getSearch(): AnySearch {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search);
}

function readBool(sp: AnySearch, key: string, def: boolean): boolean {
  const v = sp?.get?.(key) ?? null;
  if (v == null) return def;
  const s = v.toLowerCase();
  return s === '1' || s === 'true' || s === 't' || s === 'yes' || s === 'y';
}

function readNum(
  sp: AnySearch,
  key: string,
  def: number,
  min?: number,
  max?: number
): number {
  const raw = sp?.get?.(key);
  if (raw == null) return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  let out = n;
  if (typeof min === 'number') out = Math.max(min, out);
  if (typeof max === 'number') out = Math.min(max, out);
  return out;
}

/** Update URL query without reloading. */
function writeQuery(updates: Record<string, string | number | boolean>) {
  if (typeof window === 'undefined') return;
  const sp = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(updates)) sp.set(k, String(v));
  const url = `${window.location.pathname}?${sp.toString()}`;
  window.history.replaceState(null, '', url);
}

export default function Model1HeatmapPage() {
  const search = useMemo(getSearch, []);

  // UI state (init from URL)
  const [showHeatmap, setShowHeatmap] = useState(() => readBool(search, 'hm', true));
  const [showMarkers, setShowMarkers] = useState(() => readBool(search, 'mk', true));
  const [showCouncil, setShowCouncil] = useState(() => readBool(search, 'co', true));

  // Sliders: radius, blur, intensity (0..1 used to drive minOpacity)
  const [heatRadius, setHeatRadius] = useState(() => readNum(search, 'r', 28, 2, 80));
  const [heatBlur, setHeatBlur] = useState(() => readNum(search, 'b', 25, 2, 80));
  const [heatIntensity, setHeatIntensity] = useState(() =>
    readNum(search, 'i', 0.5, 0, 1)
  );

  const [stationsCount, setStationsCount] = useState(0);

  // keep URL in sync with UI
  useEffect(() => {
    writeQuery({
      hm: showHeatmap ? 1 : 0,
      mk: showMarkers ? 1 : 0,
      co: showCouncil ? 1 : 0,
      r: heatRadius,
      b: heatBlur,
      i: Number(heatIntensity.toFixed(2)),
    });
  }, [showHeatmap, showMarkers, showCouncil, heatRadius, heatBlur, heatIntensity]);

  // HeatLayer options
  const heatOptions = useMemo(
    () => ({
      radius: heatRadius,
      blur: heatBlur,
      minOpacity: Math.max(0, Math.min(1, 0.15 + heatIntensity * 0.65)),
    }),
    [heatRadius, heatBlur, heatIntensity]
  );

  return (
    <div className="relative">
      {/* Controls header */}
      <div className="absolute left-3 right-3 top-3 z-[1000] rounded-md bg-white/92 shadow px-3 py-2 text-sm flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showHeatmap}
            onChange={(e) => setShowHeatmap(e.target.checked)}
          />
          Heatmap
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showMarkers}
            onChange={(e) => setShowMarkers(e.target.checked)}
          />
          Markers
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showCouncil}
            onChange={(e) => setShowCouncil(e.target.checked)}
          />
          Council
        </label>

        {/* Radius */}
        <div className="flex items-center gap-2">
          <span>Radius</span>
          <input
            type="range"
            min={2}
            max={80}
            step={1}
            value={heatRadius}
            onChange={(e) => setHeatRadius(Number(e.target.value))}
          />
        </div>

        {/* Blur */}
        <div className="flex items-center gap-2">
          <span>Blur</span>
          <input
            type="range"
            min={2}
            max={80}
            step={1}
            value={heatBlur}
            onChange={(e) => setHeatBlur(Number(e.target.value))}
          />
        </div>

        {/* Intensity */}
        <div className="flex items-center gap-2">
          <span>Intensity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={heatIntensity}
            onChange={(e) => setHeatIntensity(Number(e.target.value))}
          />
        </div>

        <span className="opacity-70">stations: {stationsCount}</span>
      </div>

      {/* Map */}
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
