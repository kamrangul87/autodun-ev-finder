import dynamic from 'next/dynamic';

// Guard SSR: entire map client-only
const Model1HeatmapClient = dynamic(() => import('./Model1HeatmapClient'), { 
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-600">Loading map...</p>
    </div>
  )
});

export default function Page() {
  return (
    <>
      {/* Import leaflet CSS once only */}
      <link 
        rel="stylesheet" 
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" 
        crossOrigin="" 
      />
      {/* Flex column parent - map inherits height via flex:1 (no fixed sizes) */}
      <div className="min-h-screen flex flex-col">
        <Model1HeatmapClient />
      </div>
    </>
  );
}
