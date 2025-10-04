'use client';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet'; import 'leaflet.heat';
type Props = { points: [number, number, number][] };
export default function HeatLayer({ points }: Props){
  const map = useMap();
  useEffect(()=>{
    const HF = (L as any)?.heatLayer as ((pts:any[],opts?:any)=>any)|undefined;
    if (!map || !HF) return;
    const layer = HF(points, { radius:30, blur:22, maxZoom:18, max:1, minOpacity:0.35 });
    layer.addTo(map);
    return ()=>{ try{ layer.remove(); }catch{} };
  }, [map, JSON.stringify(points)]);
  return null;
}
