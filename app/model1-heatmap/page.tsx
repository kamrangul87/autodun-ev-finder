

"use client";
export const viewport = { themeColor: '#0b1220' };
export const dynamic = 'force-dynamic';

import React from 'react';
import nextDynamic from 'next/dynamic';

const ClientMap = nextDynamic(
  () => import('../../components/ClientMap'),
  { ssr: false }
);

const DEFAULT_CENTER: [number, number] = [51.5074, -0.1278]; // London
const DEFAULT_ZOOM = 12;
const tileUrl = process.env.NEXT_PUBLIC_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export default function Model1HeatmapPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [stationsCount, setStationsCount] = React.useState<number>(0);

  const handleStations = React.useCallback((items: any[]) => {
    setStationsCount(Array.isArray(items) ? items.length : 0);
    setError(null);
  }, []);

  const handleError = React.useCallback((err: any) => {
    setError(typeof err === 'string' ? err : 'Failed to load stations');
    setStationsCount(0);
  }, []);

  return (
    <div className="w-full h-screen">
      {error && (
        <div className="absolute z-[1000] left-1/2 -translate-x-1/2 top-3 bg-red-100 text-red-800 rounded-xl shadow p-2 text-center">
          {error}
        </div>
      )}
      <ClientMap
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        tileUrl={tileUrl}
      />
      {/* Legend count (stations: N) is handled in ClientMap */}
    </div>
  );
}
