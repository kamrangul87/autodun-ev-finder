// app/model1-heatmap/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import dynamicImport from 'next/dynamic';

// Client-only map (no SSR) to avoid `window is not defined`
const ClientMap = dynamicImport(() => import('@/components/ClientMap'), {
  ssr: false,
  loading: () => <div style={{ height: '60vh' }} />,
});

export default function Page() { return <ClientMap />; }
