'use client';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import 'leaflet.heat';

type Props = { points: [number, number, number][] };

export default function HeatLayer({ points }: Props) {
  const map: any = useMap();
  useEffect(() => {
    // @ts-ignore
    const layer = (window as any).L.heatLayer(points, { radius: 25, blur: 15 });
    layer.addTo(map);
    return () => { layer.remove(); };
  }, [map, JSON.stringify(points)]);
  return null;
}
