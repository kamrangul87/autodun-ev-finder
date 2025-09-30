// app/model1-heatmap/page.tsx
import dynamic from 'next/dynamic';

// Load the map **only on the client** to avoid SSR/hydration crashes.
const ClientMap = dynamic(() => import('@/components/ClientMap'), { ssr: false });

const DEFAULT_CENTER: [number, number] = [51.5072, -0.1276];
const DEFAULT_ZOOM = 9;

export default function Page() {
  // If you have UI state/toggles on this page, keep them here and pass through.
  return (
    <main className="w-full">
      <ClientMap
        initialCenter={DEFAULT_CENTER}
        initialZoom={DEFAULT_ZOOM}
        showHeatmap
        showMarkers
        showCouncil
        heatOptions={{}}              // keep empty or pass your intensity/radius options
        onStationsCount={() => {}}    // no-op; wire up if you show station count in UI
      />
    </main>
  );
}
