// app/model1-heatmap/page.tsx
import dynamic from 'next/dynamic';

// Load the map only on the client to avoid SSR/hydration issues
const ClientMap = dynamic(() => import('@/components/ClientMap'), { ssr: false });

const DEFAULT_CENTER: [number, number] = [51.5072, -0.1276];
const DEFAULT_ZOOM = 9;

export default function Page() {
  return (
    <main className="w-full">
      <ClientMap
        initialCenter={DEFAULT_CENTER}
        initialZoom={DEFAULT_ZOOM}
        showHeatmap
        showMarkers
        showCouncil
        heatOptions={{}}   // keep/tune as needed
        /* onStationsCount removed — cannot pass functions from a Server Component */
      />
    </main>
  );
}
