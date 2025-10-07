import dynamic from 'next/dynamic';

const Model1HeatmapClient = dynamic(() => import('./Model1HeatmapClient'), { 
  ssr: false,
  loading: () => <div className="h-screen flex items-center justify-center">Loading map...</div>
});

export default function Page() {
  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 relative">
          <Model1HeatmapClient />
        </div>
      </div>
    </>
  );
}
