
"use client";
export const viewport = {
  themeColor: '#0b1220',
};

export const dynamic = 'force-dynamic'; // disable SSG for this route

import React from 'react';
import nextDynamic from 'next/dynamic';

// Import the client-only map component (use RELATIVE path so no alias issues)
const ClientMap = nextDynamic(
  () => import('../../components/ClientMap'),
  { ssr: false }
);

const DEFAULT_CENTER: [number, number] = [51.5074, -0.1278]; // London
const DEFAULT_ZOOM = 12;


  const tileUrl = process.env.NEXT_PUBLIC_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  // State for error banner and stations count
  const [error, setError] = React.useState<string | null>(null);
  const [stationsCount, setStationsCount] = React.useState<number>(0);

  // Callback for ClientMap to handle error and count
  const handleStations = React.useCallback((items: any[]) => {
    setStationsCount(Array.isArray(items) ? items.length : 0);
    setError(null);
  }, []);

  // Error handler for fetch failures
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
        onStations={handleStations}
        onError={handleError}
      />
      {/* Legend count (stations: N) is handled in ClientMap */}
    </div>
  );
}
