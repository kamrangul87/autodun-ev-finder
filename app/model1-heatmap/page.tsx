'use client';

export const dynamic = 'force-dynamic';

import dynamicImport from 'next/dynamic';
import { useState } from 'react';

// Load the map only on the client
const ClientMap = dynamicImport(() => import('@/components/ClientMap'), {
  ssr: false,
});

const DEFAULT_CENTER: [number, number] = [51.509, -0.118];
const DEFAULT_ZOOM = 12;

export default function Model1HeatmapPage() {
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCouncil, setShowCouncil] = useState(true);
  const [stationsCount, setStationsCount] = useState(0);

  // Heat controls
  const [heatRadius, setHeatRadius] = useState(45);     // leaflet.heat radius
  const [heatBlur, setHeatBlur] = useState(25);         // leaflet.heat blur
  const [heatIntensity, setHeatIntensity] = useState(1); // our multiplier (0.1–3)

  return (
    <div className="relative">
      {/* Controls */}
      <div className="absolute left-1/2 -translate-x-1/2 top-3 z-[1000] rounded-md bg-white/90 shadow px-3 py-2 text-sm flex items-center gap-4">
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

        {/* Sliders for heat options */}
        <div className="flex items-center gap-2">
          <span>Radius</span>
          <input
            type="range"
            min={10}
            max={80}
            step={1}
            value={heatRadius}
            onChange={(e) => setHeatRadius(parseInt(e.target.value, 10))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span>Blur</span>
          <input
            type="range"
            min={5}
            max={45}
            step={1}
            value={heatBlur}
            onChange={(e) => setHeatBlur(parseInt(e.target.value, 10))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span>Intensity</span>
          <input
            type="range"
            min={0.1}
            max={3}
            step={0.1}
            value={heatIntensity}
            onChange={(e) => setHeatIntensity(parseFloat(e.target.value))}
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
        heatOptions={{
          radius: heatRadius,
          blur: heatBlur,
          minOpacity: 0.5,
          intensity: heatIntensity, // <-- use intensity (not "boost")
        }}
      />
    </div>
  );
}
