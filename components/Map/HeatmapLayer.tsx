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
        Math.min((s.connectors || 1) * 0.5, 1)
      ]) as [number, number, number][];

    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
    }

    heatLayerRef.current = (L as any).heatLayer(heatPoints, {
      radius: 25,
      blur: 15,
      maxZoom: 17,
      max: 1.0,
      gradient: {
        0.0: 'blue',
        0.5: 'lime',
        0.7: 'yellow',
        1.0: 'red'
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
