"use client";

import NextDynamic from 'next/dynamic';

const ClientMapInner = NextDynamic(() => import('./ClientMapInner'), { ssr: false });

export type HeatOptions = { intensity: number; radius: number; blur: number };
export type Props = {
  initialCenter: [number, number];
  initialZoom: number;
  showHeatmap: boolean;
  showMarkers: boolean;
  showCouncil: boolean;
  heatOptions: HeatOptions;
  onStationsCount?: (n: number) => void;
};

export default function ClientMap(props: Partial<Props>) {
  const {
    initialCenter = [51.5074, -0.1278],
    initialZoom = 12,
    showHeatmap = true,
    showMarkers = true,
    showCouncil = true,
    heatOptions = { intensity: 1, radius: 18, blur: 15 },
    onStationsCount,
  } = props;
  if (typeof window === 'undefined') return null;

  // Forward only supported props to inner component; keep logic in inner intact.
  return (
    <ClientMapInner
      initialCenter={initialCenter}
      initialZoom={initialZoom}
      showHeatmap={showHeatmap}
      showMarkers={showMarkers}
      showCouncil={showCouncil}
      heatOptions={heatOptions}
      onStationsCount={onStationsCount}
    />
  );
}
