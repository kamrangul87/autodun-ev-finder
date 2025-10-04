'use client';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

type Props = {
  /** [lat, lng, intensity 0..1] */
  points: [number, number, number][];
};

/**
 * Robust heat layer that works in Next.js + React-Leaflet v4.
 * Uses Leaflet.heat via side-effect import and guards if plugin missing.
 */
export default function HeatLayer({ points }: Props) {
  const map = useMap();

  useEffect(() => {
    // if plugin didn't load, don't crash
    const heatFactory = (L as any)?.heatLayer as
      | ((pts: any[], opts?: any) => any)
      | undefined;

    if (!map || !heatFactory) return;

    const layer = heatFactory(points, {
      radius: 30,      // a bit larger for visibility
      blur: 22,
      maxZoom: 18,
      max: 1,          // our intensities are already 0..1
      minOpacity: 0.35 // makes low-intensity areas still visible
      // gradient: { 0.2: 'blue', 0.4: 'lime', 0.6: 'yellow', 1.0: 'red' } // optional
    });

    layer.addTo(map);
    return () => {
      try { layer.remove(); } catch {}
    };
    // stringify points for a simple stable dependency
  }, [map, JSON.stringify(points)]);

  return null;
}
