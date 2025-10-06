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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (councilData) return;
    
    setLoading(true);
    
    // Try API first, fallback to static file
    fetch('/api/councils')
      .catch(() => fetch('/data/councils-london.geo.json'))
      .then(res => res.ok ? res.json() : Promise.reject('Load failed'))
      .then(data => {
        console.log('Council data loaded:', data.features?.length, 'features');
        setCouncilData(data);
      })
      .catch(err => {
        console.warn('Failed to load council data:', err);
      })
      .finally(() => setLoading(false));
  }, [councilData]);

  useEffect(() => {
    if (!councilData || !visible) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    // Create pane if needed
    if (!map.getPane('councils')) {
      const pane = map.createPane('councils');
      pane.style.zIndex = '450';
    }

    // Remove old layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    // Add new layer
    layerRef.current = L.geoJSON(councilData, {
      pane: 'councils',
      style: {
        color: '#3A8DFF',
        weight: 2,
        dashArray: '6, 4',
        fillColor: '#3A8DFF',
        fillOpacity: 0.08,
      },
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.NAME || 
                     feature.properties?.name || 
                     feature.properties?.LAD23NM || 
                     'Unknown';
        
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
            e.target.setStyle({ weight: 2, fillOpacity: 0.08 });
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
