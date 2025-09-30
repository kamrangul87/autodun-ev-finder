'use client';

import dynamic from 'next/dynamic';
const ClientMap = dynamic(() => import('@/components/ClientMap'), { ssr: false });

const DEFAULT_CENTER: [number, number] = [51.5072, -0.1276];

export default function Model1HeatmapPage() {
  return <ClientMap initialCenter={DEFAULT_CENTER} initialZoom={10} />;
}
