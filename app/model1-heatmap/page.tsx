'use client';

export const dynamic = 'force-dynamic'; // no SSG; avoids server touching map

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

// Load the map client-only so server never evaluates react-leaflet/leaflet
const ClientMap = dynamic(() => import('@/components/ClientMap'), { ssr: false });

type ExtraParams = Record<string, string | number | boolean>;

const DEFAULT_CENTER: [number, number] = [51.5074, -0.1278]; // London
const DEFAULT_ZOOM = 12;

export default function Model1HeatmapPage() {
  const [showMarkers, setShowMarkers] = useState(true);

  const tileUrl =
    process.env.NEXT_PUBLIC_TILE_URL ||
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  const extraParams: ExtraParams = useMemo(
    () => ({
      source: 'osm', // swap to 'council' if your API supports it
      minPower: 0,
    }),
    []
  );

  return (
    <div className="w-full h-[calc(100vh-120px)] relative">
      {/* UI controls */}
      <div className="absolute z-[1000] right-3 top-3 bg-white/90 rounded-xl shadow p-2 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showMarkers}
            onChange={(e) => setShowMarkers(e.target.checked)}
          />
          Show markers
        </label>
      </div>

      <ClientMap
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        tileUrl={tileUrl}
        showMarkers={showMarkers}
        extraParams={extraParams}
      />
    </div>
  );
}
