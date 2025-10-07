'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

interface Station {
  latitude: number;
  longitude: number;
  connectors?: number;
}

interface HeatLayerProps {
  stations: Station[];
  visible: boolean;
}

export default function HeatmapLayer({ stations, visible }: HeatLayerProps) {
  const map = useMap();
  const heatLayerRef = useRef<any>(null);

  useEffect(() => {
    if (!visible || !stations.length) {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      return;
    }

    const heatPoints = stations
      .filter(s => s.latitude && s.longitude)
      .map(s => [
        s.latitude,
        s.longitude,
        Math.min((s.connectors || 1) * 0.4, 1.0)
      ]) as [number, number, number][];

    if (heatPoints.length === 0) {
      console.warn('[Heatmap] No valid points to render');
      return;
    }

    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
    }

    heatLayerRef.current = (L as any).heatLayer(heatPoints, {
      radius: 22,
      blur: 20,
      maxZoom: 25,
      minOpacity: 0.3,
      max: 1.0,
      gradient: {
        0.0: 'rgba(0,0,255,0)',
        0.2: 'rgba(0,0,255,0.6)',
        0.4: 'rgba(0,255,255,0.7)',
        0.6: 'rgba(0,255,0,0.8)',
        0.8: 'rgba(255,255,0,0.9)',
        1.0: 'rgba(255,0,0,1)'
      }
    }).addTo(map);

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [map, stations, visible]);

  return null;
}
