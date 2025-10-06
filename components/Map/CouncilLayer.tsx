'use client';

import { useEffect, useState, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface CouncilLayerProps {
  visible: boolean;
}

export default function CouncilLayer({ visible }: CouncilLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const [councilData, setCouncilData] = useState<any>(null);

  useEffect(() => {
    fetch('/data/london-boroughs.geojson')
      .then(res => res.json())
      .then(data => setCouncilData(data))
      .catch(err => console.error('Failed to load council data:', err));
  }, []);

  useEffect(() => {
    if (!councilData) return;

    if (!map.getPane('boroughs')) {
      const pane = map.createPane('boroughs');
      pane.style.zIndex = '450';
    }

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!visible) return;

    layerRef.current = L.geoJSON(councilData, {
      pane: 'boroughs',
      style: {
        color: '#3A8DFF',
        weight: 2,
        dashArray: '6,4',
        fillOpacity: 0.0,
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.NAME || feature.properties?.name || 'Unknown';
        
        layer.on({
          mouseover: (e) => {
            const target = e.target;
            target.setStyle({ weight: 3 });
            target.bindTooltip(name, {
              permanent: false,
              direction: 'center',
              className: 'council-tooltip',
            }).openTooltip();
          },
          mouseout: (e) => {
            const target = e.target;
            target.setStyle({ weight: 2 });
            target.closeTooltip();
          },
        });
      },
    }).addTo(map);

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, councilData, visible]);

  return null;
}
