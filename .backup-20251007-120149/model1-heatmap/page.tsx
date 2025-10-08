'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import FeedbackModal from '@/components/FeedbackModal';

const Model1HeatmapClient = dynamic<{ onStationsCount?: (n: number) => void }>(
  () => import('./Model1HeatmapClient'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading map...</p>
      </div>
    ),
  }
);

export default function Page() {
  const [markersCount, setMarkersCount] = useState<number>(0);

  return (
    <>
      {/* Load Leaflet CSS once */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossOrigin=""
      />
      {/* Map client only; your existing top toolbar remains untouched elsewhere */}
      <div className="min-h-screen flex flex-col">
        <Model1HeatmapClient onStationsCount={setMarkersCount} />
      </div>
      <FeedbackModal />
    </>
  );
}
