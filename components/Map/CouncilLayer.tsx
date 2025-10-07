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
    if (visible && !councilData && !loading) {
      setLoading(true);
      fetch('/api/councils')
        .catch(() => fetch('/data/councils-london.geo.json'))
        .then(res => res.ok ? res.json() : Promise.reject('Load failed'))
        .then(data => {
          if (!data.features || data.features.length === 0) {
            console.warn('[Council] GeoJSON has no features');
          }
          setCouncilData(data);
        })
        .catch(err => {
          console.error('[Council] Failed to load:', err);
        })
        .finally(() => setLoading(false));
    }
  }, [visible, councilData, loading]);

  useEffect(() => {
    if (!councilData || !visible) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    if (!map.getPane('councils')) {
      const pane = map.createPane('councils');
      pane.style.zIndex = '450';
    }

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    layerRef.current = L.geoJSON(councilData, {
      pane: 'councils',
      style: {
        fillColor: '#3A8DFF',
        fillOpacity: 0.08,
        color: '#3A8DFF',
        weight: 2,
        dashArray: '6, 4',
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
