// app/model1-heatmap/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import dynamic from 'next/dynamic';

// Leaflet/Map component must be client-only:
const ClientMap = dynamic(() => import('@/components/ClientMap'), {
  ssr: false,
  // optional: show a lightweight loader while the client bundle hydrates
  loading: () => <div className="p-4 text-sm">Loading map…</div>,
});

export default function Model1HeatmapPage() {
  return (
    <main className="min-h-screen">
      <ClientMap />
    </main>
  );
}
