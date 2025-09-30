// app/model1-heatmap/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import NextDynamic from 'next/dynamic';

// Client-only map (no SSR) to avoid `window is not defined`
const ClientMap = NextDynamic(() => import('@/components/ClientMap'), {
  ssr: false,
  loading: () => <div className="p-4 text-sm">Loading map…</div>,
});

export default function Model1HeatmapPage() {
  return (
    <main className="min-h-screen">
      <ClientMap />
    </main>
  );
}
