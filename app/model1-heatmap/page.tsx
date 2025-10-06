import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const Model1HeatmapClient = dynamic(() => import('./Model1HeatmapClient'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="text-4xl mb-4">⚡</div>
        <p className="text-gray-600">Loading map...</p>
      </div>
    </div>
  ),
});

export default function Page() {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossOrigin=""
      />
      <Suspense fallback={<div>Loading...</div>}>
        <Model1HeatmapClient />
      </Suspense>
    </>
  );
}
