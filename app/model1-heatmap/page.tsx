"use client";

export const dynamic = "force-dynamic"; // disable prerender/SSG for this page

import dynamicImport from "next/dynamic";
import { useState } from "react";

// Load the map only on the client (no SSR), avoids "window is not defined"
const ClientMap = dynamicImport(() => import("@/components/ClientMap"), { ssr: false });

const DEFAULT_CENTER: [number, number] = [51.509, -0.118];
const DEFAULT_ZOOM = 12;

export default function Model1HeatmapPage() {
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCouncil, setShowCouncil] = useState(true);
  const [stationsCount, setStationsCount] = useState(0);

  // Heatmap tuning controls
  const [heatRadius, setHeatRadius] = useState(60); // px
  const [heatBlur, setHeatBlur] = useState(34);     // px
  const [heatBoost, setHeatBoost] = useState(1.4);  // multiplies station weight

  return (
    <div className="relative">
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

        {/* Heatmap sliders (visible only when Heatmap is on) */}
        {showHeatmap && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1">
              <span className="whitespace-nowrap">Radius</span>
              <input
                type="range"
                min={20}
                max={100}
                value={heatRadius}
                onChange={(e) => setHeatRadius(+e.target.value)}
                aria-label="Heatmap radius"
              />
            </label>

            <label className="flex items-center gap-1">
              <span className="whitespace-nowrap">Blur</span>
              <input
                type="range"
                min={10}
                max={80}
                value={heatBlur}
                onChange={(e) => setHeatBlur(+e.target.value)}
                aria-label="Heatmap blur"
              />
            </label>

            <label className="flex items-center gap-1">
              <span className="whitespace-nowrap">Intensity</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={heatBoost}
                onChange={(e) => setHeatBoost(+e.target.value)}
                aria-label="Heatmap intensity"
              />
            </label>
          </div>
        )}

        <span className="opacity-70">stations: {stationsCount}</span>
      </div>

      <ClientMap
        initialCenter={DEFAULT_CENTER}
        initialZoom={DEFAULT_ZOOM}
        showHeatmap={showHeatmap}
        showMarkers={showMarkers}
        showCouncil={showCouncil}
        onStationsCount={setStationsCount}
        // Pass heatmap options down
        heatOptions={{
          radius: heatRadius,
          blur: heatBlur,
          minOpacity: 0.5,
          boost: heatBoost,
        }}
      />
    </div>
  );
}
