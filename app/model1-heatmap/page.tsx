// app/model1-heatmap/page.tsx
import dynamic from 'next/dynamic';

// Load the map only on the client to avoid SSR/hydration issues.
const ClientMap = dynamic(() => import('@/components/ClientMap'), { ssr: false });

const DEFAULT_CENTER: [number, number] = [51.5072, -0.1276];
const DEFAULT_ZOOM = 9;

export default function Page() {
  return (
    <main className="w-full">
      <ClientMap
        initialCenter={DEFAULT_CENTER}
        initialZoom={DEFAULT_ZOOM}
        // No function props here (e.g., onStationsCount) — keeps this page a Server Component.
      />
    </main>
  );
}
