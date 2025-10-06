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

export default function HeatLayer({ stations, visible }: HeatLayerProps) {
  const map = useMap();
  const heatLayerRef = useRef<any>(null);

  useEffect(() => {
    if (!visible) {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      return;
    }

    if (!stations.length) return;

    if (!map.getPane('heatmap')) {
      const pane = map.createPane('heatmap');
      pane.style.zIndex = '400';
    }

    const heatPoints = stations.map(s => {
      const intensity = Math.min(Math.max(s.connectors || 1, 1), 8);
      return [s.latitude, s.longitude, intensity];
    }) as [number, number, number][];

    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
    }

    heatLayerRef.current = (L as any).heatLayer(heatPoints, {
      radius: 28,
      blur: 22,
      maxZoom: 18,
      max: 8,
      pane: 'heatmap',
      gradient: {
        0.0: 'rgba(0, 255, 0, 0)',
        0.2: '#00ff00',
        0.4: '#ffff00',
        0.6: '#ff8000',
        0.8: '#ff0000',
        1.0: '#cc0000',
      },
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
