'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';

// Load Leaflet CSS only in the browser (no SSR touch)
if (typeof window !== 'undefined') {
  import('leaflet/dist/leaflet.css');
}

type Station = {
  id: string | number;
  lat: number;
  lng: number;
  name?: string;
  address?: string;
  postcode?: string;
  connectors?: number;
};

const LONDON_CENTER: [number, number] = [51.5074, -0.1278];

export default function Model1HeatmapNoRL() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const heatLayerRef = useRef<any>(null);

  const [stations, setStations] = useState<Station[]>([]);
  const [showHeat, setShowHeat] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);

  // Fetch stations once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/stations?lat=51.5074&lon=-0.1278&dist=15', { cache: 'no-store' });
        const j = await res.json();
        const items: Station[] = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
        if (!cancelled) setStations(items);
      } catch {
        if (!cancelled) setStations([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const heatPoints = useMemo<[number, number, number?][]>(() =>
    stations.map(s => [s.lat, s.lng, 0.7]), [stations]);

  // Initialize Leaflet map on mount (browser only)
  useEffect(() => {
    let destroyed = false;

    (async () => {
      const L = (await import('leaflet')).default as any;

      // Fix default marker icons
      const [retina, icon, shadow] = await Promise.all([
        import('leaflet/dist/images/marker-icon-2x.png'),
        import('leaflet/dist/images/marker-icon.png'),
        import('leaflet/dist/images/marker-shadow.png'),
      ]);
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: (retina as any).default ?? retina,
        iconUrl: (icon as any).default ?? icon,
        shadowUrl: (shadow as any).default ?? shadow,
      });

      if (destroyed || !mapEl.current) return;

      // Create map only once
      const map = L.map(mapEl.current, {
        center: LONDON_CENTER,
        zoom: 12,
        preferCanvas: true,
      });
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
    })();

    return () => {
      destroyed = true;
      // Destroy map on unmount
      try {
        if (mapRef.current) {
          mapRef.current.remove();
        }
      } catch {}
      mapRef.current = null;
      heatLayerRef.current = null;
    };
  }, []);

  // (Re)build heat layer when stations or toggle change
  useEffect(() => {
    (async () => {
      if (!mapRef.current) return;

      const L = (await import('leaflet')).default as any;
      await import('leaflet.heat');

      // Remove existing heat layer
      if (heatLayerRef.current) {
        try { mapRef.current.removeLayer(heatLayerRef.current); } catch {}
        heatLayerRef.current = null;
      }

      if (!showHeat || !heatPoints.length) return;

      const layer = (L as any).heatLayer(heatPoints, {
        radius: 20,
        blur: 12,
        maxZoom: 17,
        minOpacity: 0.35,
      });
      layer.addTo(mapRef.current);
      heatLayerRef.current = layer;
    })();
  }, [showHeat, heatPoints]);

  // Markers (create/remove when toggle or stations change)
  useEffect(() => {
    let layerGroup: any = null;

    (async () => {
      if (!mapRef.current) return;
      const L = (await import('leaflet')).default as any;

      layerGroup = L.layerGroup();
      if (showMarkers) {
        stations.forEach((s) => {
          const m = L.marker([s.lat, s.lng]);
          const html = `
            <div style="min-width:220px">
              <strong>${s.name ?? 'EV Charger'}</strong><br/>
              ${s.address ? `${s.address}<br/>` : ''}
              ${s.postcode ? `${s.postcode}<br/>` : ''}
              ${typeof s.connectors === 'number' ? `Connectors: ${s.connectors}<br/>` : ''}
            </div>`;
          m.bindPopup(html);
          m.addTo(layerGroup);
        });
      }
      layerGroup.addTo(mapRef.current);
    })();

    return () => {
      try {
        if (layerGroup && mapRef.current) {
          mapRef.current.removeLayer(layerGroup);
        }
      } catch {}
    };
  }, [showMarkers, stations]);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      {/* Controls */}
      <div style={{
        position: 'absolute', zIndex: 1000, left: 12, top: 12, display: 'flex',
        gap: 12, background: 'white', padding: '6px 10px', borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        <label><input type="checkbox" checked={showHeat} onChange={e => setShowHeat(e.target.checked)} /> Heatmap</label>
        <label><input type="checkbox" checked={showMarkers} onChange={e => setShowMarkers(e.target.checked)} /> Markers</label>
      </div>

      <div style={{
        position: 'absolute', zIndex: 1000, right: 12, top: 12,
        background: 'white', padding: '6px 10px', borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        stations: {stations.length}
      </div>

      {/* Map container */}
      <div ref={mapEl} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
