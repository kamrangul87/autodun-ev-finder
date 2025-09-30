'use client';

import { useMemo, useState } from 'react';
import ClientMap from '@/components/ClientMap';

const DEFAULT_CENTER: [number, number] = [51.5074, -0.1278];
const DEFAULT_ZOOM = 11;

export default function HeatmapPage() {
  // UI state is client-only to avoid “Event handlers cannot be passed…” build errors
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCouncil, setShowCouncil] = useState(true);
  const [stationsCount, setStationsCount] = useState<number>(0);

  // heat options (safe defaults)
  const heatOptions = useMemo(
    () => ({
      intensity: 0.6, // 0..1 scaling
      radius: 28,     // px
      blur: 18,       // px
    }),
    []
  );

  return (
    <div className="w-full">
      <div className="flex items-center gap-5 px-4 pt-4 pb-2">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={showHeatmap} onChange={e => setShowHeatmap(e.target.checked)} />
          <span>Heatmap</span>
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={showMarkers} onChange={e => setShowMarkers(e.target.checked)} />
          <span>Markers</span>
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={showCouncil} onChange={e => setShowCouncil(e.target.checked)} />
          <span>Council</span>
        </label>
        <div className="opacity-70 text-sm">Stations: {stationsCount}</div>
      </div>

      <ClientMap
        initialCenter={DEFAULT_CENTER}
        initialZoom={DEFAULT_ZOOM}
        showHeatmap={showHeatmap}
        showMarkers={showMarkers}
        showCouncil={showCouncil}
        heatOptions={heatOptions}
        onStationsCount={setStationsCount}
      />
    </div>
  );
}
