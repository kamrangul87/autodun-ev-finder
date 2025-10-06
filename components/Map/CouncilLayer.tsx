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
      .then(res => res.ok ? res.json() : Promise.reject('Not found'))
      .then(data => {
        console.log('Council data loaded');
        setCouncilData(data);
      })
      .catch(err => console.error('Council data error:', err));
  }, []);

  useEffect(() => {
    if (!councilData || !visible) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    if (!map.getPane('boroughs')) {
      const pane = map.createPane('boroughs');
      pane.style.zIndex = '450';
    }

    if (layerRef.current) map.removeLayer(layerRef.current);

    layerRef.current = L.geoJSON(councilData, {
      pane: 'boroughs',
      style: {
        color: '#3A8DFF',
        weight: 2,
        dashArray: '6,4',
        fillColor: '#3A8DFF',
        fillOpacity: 0.05,
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.NAME || feature.properties?.name || 'Unknown';
        layer.on({
          mouseover: (e) => {
            e.target.setStyle({ weight: 3, fillOpacity: 0.15 });
            e.target.bindTooltip(name, {
              permanent: false,
              direction: 'center',
              className: 'council-tooltip',
            }).openTooltip();
          },
          mouseout: (e) => {
            e.target.setStyle({ weight: 2, fillOpacity: 0.05 });
            e.target.closeTooltip();
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
