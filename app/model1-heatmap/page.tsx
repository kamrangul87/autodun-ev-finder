'use client';

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

export default function Model1HeatmapPage() {
  const tileUrl =
    process.env.NEXT_PUBLIC_TILE_URL ||
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  return (
    <div className="w-full h-screen">
      <ClientMap center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} tileUrl={tileUrl} />
    </div>
  );
}
