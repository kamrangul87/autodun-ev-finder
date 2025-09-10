import dynamic from 'next/dynamic';
import points from '../data/evPoints';

const HeatmapWithScaling = dynamic(
  () => import('../components/HeatmapWithScaling'),
  { ssr: false } // avoid "window is not defined"
);

export default function EvPage() {
  return (
    <main className="p-4">
      <HeatmapWithScaling points={points} defaultScale="robust" />
    </main>
  );
}
