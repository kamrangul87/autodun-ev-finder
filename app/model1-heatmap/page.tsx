"use client";

import { useState } from "react";
import ClientMap from "@/components/ClientMap";

const DEFAULT_CENTER: [number, number] = [51.509, -0.118];
const DEFAULT_ZOOM = 12;

export default function Model1HeatmapPage() {
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCouncil, setShowCouncil] = useState(true);
  const [stationsCount, setStationsCount] = useState(0);

  return (
    <div className="relative">
      {/* Toggle panel (no external component required) */}
      <div className="absolute right-3 top-3 z-[1000] rounded-md bg-white/90 shadow px-3 py-2 text-sm flex items-center gap-4">
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
      />
    </div>
  );
}
