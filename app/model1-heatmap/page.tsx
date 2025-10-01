export const dynamic = 'force-dynamic';
export const revalidate = 0;

import dynamicImport from 'next/dynamic';

const ClientMap = dynamicImport(() => import('@/components/ClientMap'), {
  ssr: false,
  loading: () => <div>Loading map…</div>,
});

export default function Page() { return <ClientMap />; }
