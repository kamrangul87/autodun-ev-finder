'use client';

export const dynamic = 'force-dynamic';

import dynamicImport from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// Load the map only on the client (no SSR)
const ClientMap = dynamicImport(() => import('@/components/ClientMap'), { ssr: false });

const DEFAULT_CENTER: [number, number] = [51.509, -0.118];
const DEFAULT_ZOOM = 12;

// tiny helpers to read/write query params
function readBool(sp: URLSearchParams, key: string, fallback: boolean) {
  const v = sp.get(key);
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return fallback;
}
function readNum(sp: URLSearchParams, key: string, fallback: number) {
  const v = Number(sp.get(key));
  return Number.isFinite(v) ? v : fallback;
}

export default function Model1HeatmapPage() {
  const router = useRouter();
  const search = useSearchParams();

  // UI state (init from URL)
  const [showHeatmap, setShowHeatmap] = useState(() => readBool(search, 'hm', true));
  const [showMarkers, setShowMarkers] = useState(() => readBool(search, 'mk', true));
  const [showCouncil, setShowCouncil] = useState(() => readBool(search, 'co', true));

  const [heatRadius, setHeatRadius] = useState(() => readNum(search, 'r', 28));
  const [heatBlur, setHeatBlur] = useState(() => readNum(search, 'b', 25));
  const [heatMinOpacity, setHeatMinOpacity] = useState(() => readNum(search, 'i', 0.35));

  const initialCenter: [number, number] = useMemo(() => {
    const lat = Number(search.get('lat'));
    const lng = Number(search.get('lng'));
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    return DEFAULT_CENTER;
  }, [search]);

  const initialZoom = useMemo(() => {
    const z = Number(search.get('z'));
    return Number.isFinite(z) ? z : DEFAULT_ZOOM;
  }, [search]);

  const [stationsCount, setStationsCount] = useState(0);

  // write state to the URL (debounced-ish via microtask)
  useEffect(() => {
    const params = new URLSearchParams(search.toString());
    params.set('hm', showHeatmap ? '1' : '0');
    params.set('mk', showMarkers ? '1' : '0');
    params.set('co', showCouncil ? '1' : '0');
    params.set('r', String(heatRadius));
    params.set('b', String(heatBlur));
    params.set('i', String(heatMinOpacity));
    // Keep lat/lng/z updates driven by map itself (ClientMap can update later if needed)

    router.replace(`?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHeatmap, showMarkers, showCouncil, heatRadius, heatBlur, heatMinOpacity]);

  return (
    <div className="relative">
      {/* Top controls */}
      <div className="absolute left-1/2 -translate-x-1/2 top-3 z-[1000] rounded-md bg-white/92 backdrop-blur shadow px-3 py-2 text-sm flex items-center gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showHeatmap} onChange={e => setShowHeatmap(e.target.checked)} />
          Heatmap
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showMarkers} onChange={e => setShowMarkers(e.target.checked)} />
          Markers
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showCouncil} onChange={e => setShowCouncil(e.target.checked)} />
          Council
        </label>

        <div className="flex items-center gap-2">
          <span>Radius</span>
          <input
            type="range"
            min={10}
            max={60}
            step={1}
            value={heatRadius}
            onChange={e => setHeatRadius(Number(e.target.value))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span>Blur</span>
          <input
            type="range"
            min={5}
            max={60}
            step={1}
            value={heatBlur}
            onChange={e => setHeatBlur(Number(e.target.value))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span>Intensity</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={heatMinOpacity}
            onChange={e => setHeatMinOpacity(Number(e.target.value))}
          />
        </div>

        <span className="opacity-70">stations: {stationsCount}</span>
      </div>

      <ClientMap
        initialCenter={initialCenter}
        initialZoom={initialZoom}
        showHeatmap={showHeatmap}
        showMarkers={showMarkers}
        showCouncil={showCouncil}
        onStationsCount={setStationsCount}
        heatOptions={{
          radius: heatRadius,
          blur: heatBlur,
          minOpacity: heatMinOpacity,
        }}
      />
    </div>
  );
}
