'use client';

import { useEffect, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { Icon, LatLngExpression } from 'leaflet';

interface CouncilLayerProps {
  visible: boolean;
}

interface Borough {
  name: string;
  center: LatLngExpression;
}

// Orange/red icon for council markers
const councilIcon = new Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export default function CouncilLayer({ visible }: CouncilLayerProps) {
  const [boroughs, setBoroughs] = useState<Borough[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (boroughs.length > 0 || !visible) return;

    setLoading(true);
    
    // Try API first, fallback to static file
    fetch('/api/councils')
      .catch(() => fetch('/data/councils-london.geo.json'))
      .then(res => res.ok ? res.json() : Promise.reject('Load failed'))
      .then(data => {
        // Extract borough centers from GeoJSON
        const extracted: Borough[] = data.features?.map((feature: any) => {
          const name = feature.properties?.NAME || 
                       feature.properties?.name || 
                       feature.properties?.LAD23NM || 
                       'Unknown Borough';
          
          // Calculate centroid from geometry
          let center: LatLngExpression = [51.5074, -0.1278]; // London default
          
          if (feature.geometry?.type === 'Polygon' && feature.geometry.coordinates?.[0]) {
            const coords = feature.geometry.coordinates[0];
            const lats = coords.map((c: number[]) => c[1]);
            const lngs = coords.map((c: number[]) => c[0]);
            center = [
              lats.reduce((a: number, b: number) => a + b, 0) / lats.length,
              lngs.reduce((a: number, b: number) => a + b, 0) / lngs.length,
            ];
          } else if (feature.geometry?.type === 'MultiPolygon' && feature.geometry.coordinates?.[0]?.[0]) {
            const coords = feature.geometry.coordinates[0][0];
            const lats = coords.map((c: number[]) => c[1]);
            const lngs = coords.map((c: number[]) => c[0]);
            center = [
              lats.reduce((a: number, b: number) => a + b, 0) / lats.length,
              lngs.reduce((a: number, b: number) => a + b, 0) / lngs.length,
            ];
          }
          
          return { name, center };
        }) || [];
        
        console.log('Council markers loaded:', extracted.length, 'boroughs');
        setBoroughs(extracted);
      })
      .catch(err => {
        console.warn('Failed to load council data:', err);
      })
      .finally(() => setLoading(false));
  }, [boroughs.length, visible]);

  if (!visible) return null;

  return (
    <>
      {boroughs.map((borough, idx) => (
        <Marker
          key={idx}
          position={borough.center}
          icon={councilIcon}
        >
          <Popup>
            <div>
              <strong>{borough.name}</strong>
              <p className="text-xs text-gray-600 mt-1">London Borough</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}
