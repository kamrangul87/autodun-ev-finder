// app/model1-heatmap/page.tsx
'use client';

import dynamic from 'next/dynamic';

// import the map client-only to avoid SSR/hydration issues with Leaflet
const ClientMap = dynamic(() => import('@/components/ClientMap'), {
  ssr: false,
});

export default function Model1HeatmapPage() {
  return (
    <ClientMap
      initialCenter={[51.5074, -0.1278]}  // London
      initialZoom={11}
      // If your ClientMap accepts heatOptions, uncomment the line below:
      // heatOptions={{ intensity: 0.7, radius: 28, blur: 35 }}
    />
  );
}
