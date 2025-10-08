
import nextDynamic from 'next/dynamic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

const Model1HeatmapClient = nextDynamic(() => import('./Model1HeatmapClient'), { ssr: false });

export default function Page() {
  return <Model1HeatmapClient />;
}
