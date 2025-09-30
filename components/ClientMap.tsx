'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Pane } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import HeatmapWithScaling, { type HeatPoint } from '@/components/HeatmapWithScaling';
import ClusterLayer from '@/components/ClusterLayer';
import CouncilLayer from '@/components/CouncilLayer';

type Station = {
  id: number | string;
  name?: string;
  address?: string;
  postcode?: string;
  lat: number;
  lng: number;
  connectors?: number;
};

export default function ClientMap({
  initialCenter = [51.5072, -0.1276],
  initialZoom = 11,
}: { initialCenter?: [number, number]; initialZoom?: number }) {
  const mapRef = useRef<LeafletMap | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [loadMsg, setLoadMsg] = useState<string>('Loading stations…');
  const [error, setError] = useState<string | null>(null);

  // UI toggles/sliders
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCouncil, setShowCouncil] = useState(true);
  const [intensity, setIntensity] = useState(1);
  const [radius, setRadius] = useState(18);
  const [blur, setBlur] = useState(0.35);
  const [query, setQuery] = useState('');

  // Load stations from our API
  useEffect(() => {
    const load = async () => {
      try {
        const [lat, lng] = initialCenter;
        const res = await fetch(
          `/api/ocm?lat=${lat}&lng=${lng}&distance=25&maxresults=650&countrycode=GB&v=${Date.now()}`,
          { headers: { 'Accept': 'application/json' }, cache: 'no-store' }
        );
        const json = await res.json();

        if (!Array.isArray(json)) {
          throw new Error(json?.error ?? 'Unexpected response');
        }

        const mapped: Station[] = json
          .map((p: any) => ({
            id: p?.ID ?? `${p?.AddressInfo?.Latitude},${p?.AddressInfo?.Longitude}`,
            name: p?.AddressInfo?.Title ?? 'EV Charging',
            address: p?.AddressInfo?.AddressLine1 ?? '',
            postcode: p?.AddressInfo?.Postcode ?? '',
            lat: Number(p?.AddressInfo?.Latitude),
            lng: Number(p?.AddressInfo?.Longitude),
            connectors: Array.isArray(p?.Connections) ? p.Connections.length : 0,
          }))
          .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

        setStations(mapped);
        setLoadMsg(`Stations: ${mapped.length}`);
        setError(null);
        console.info('[EV] loaded', mapped.length, 'stations');
      } catch (e: any) {
        console.warn('[EV] load failed', e);
        setError(e?.message ?? 'Failed to load stations');
        setLoadMsg('Stations: 0');
      }
    };
    load();
  }, [initialCenter]);

  const heatPoints: HeatPoint[] = useMemo(
    () => stations.map((s) => ({ lat: s.lat, lng: s.lng, value: s.connectors ?? 1 })),
    [stations]
  );

  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.trim())}&limit=1`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const json = await res.json();
      if (Array.isArray(json) && json[0]) {
        const lat = parseFloat(json[0].lat);
        const lon = parseFloat(json[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          mapRef.current?.setView([lat, lon], 14);
        }
      }
    } catch (err) {
      console.error('Search failed', err);
    }
  };

  return (
    <div className="map-root">
      {/* Controls bar */}
      <div
        style={{
          position: 'absolute',
          zIndex: 1200,
          left: '50%',
          transform: 'translateX(-50%)',
          top: 12,
          width: 'min(1100px, calc(100vw - 24px))',
        }}
      >
        <div
          style={{
            background: 'rgba(255,255,255,0.94)',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 8px 28px rgba(0,0,0,0.08)',
            borderRadius: 16,
            padding: 8,
            display: 'grid',
            gridTemplateColumns: 'auto auto 1fr',
            gap: 10,
            alignItems: 'center',
          }}
        >
          {/* Toggles */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label><input type="checkbox" checked={showHeatmap} onChange={e=>setShowHeatmap(e.target.checked)} /> Heatmap</label>
            <label><input type="checkbox" checked={showMarkers} onChange={e=>setShowMarkers(e.target.checked)} /> Markers</label>
            <label><input type="checkbox" checked={showCouncil} onChange={e=>setShowCouncil(e.target.checked)} /> Council</label>
            <span style={{ marginLeft: 10, fontSize: 12, color: '#2f6b2f', fontWeight: 600 }}>{loadMsg}</span>
          </div>

          {/* Sliders */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#444' }}>Intensity</span>
            <input type="range" min={0.5} max={5} step={0.5} value={intensity} onChange={(e)=>setIntensity(Number(e.target.value))}/>
            <span style={{ fontSize: 12, color: '#444' }}>Radius</span>
            <input type="range" min={8} max={40} step={2} value={radius} onChange={(e)=>setRadius(Number(e.target.value))}/>
            <span style={{ fontSize: 12, color: '#444' }}>Blur</span>
            <input type="range" min={0} max={1} step={0.05} value={blur} onChange={(e)=>setBlur(Number(e.target.value))}/>
          </div>

          {/* Search */}
          <form onSubmit={doSearch} style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search address or place..."
              aria-label="Search"
              style={{ width: 420, height: 36, borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)', padding: '0 12px' }}
            />
            <button type="submit" style={{ height: 36, padding: '0 14px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)', background: '#fff' }}>
              Search
            </button>
          </form>
        </div>
      </div>

      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        ref={(ref) => { if (ref) mapRef.current = ref; }}
        className="leaflet-map"
        preferCanvas
        style={{ height: 'calc(100vh - 120px)' }}
      >
        <Pane name="base" style={{ zIndex: 100 }}>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors · Charging location data © Open Charge Map (CC BY 4.0)"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </Pane>

        {showHeatmap && (
          <Pane name="heatmap" style={{ zIndex: 200, pointerEvents: 'none' }}>
            <HeatmapWithScaling points={heatPoints} intensity={intensity} radius={radius} blur={blur} />
          </Pane>
        )}

        {showCouncil && (
          <Pane name="council" style={{ zIndex: 250, pointerEvents: 'none' }}>
            {/* Cache-busted so you always see the latest file */}
            <CouncilLayer url={`/data/council-test.geojson?v=${Date.now()}`} />
          </Pane>
        )}

        {showMarkers && (
          <Pane name="markers" style={{ zIndex: 300 }}>
            <ClusterLayer stations={stations} />
          </Pane>
        )}
      </MapContainer>

      {/* Error toast */}
      {error && (
        <div
          style={{
            position: 'fixed',
            left: 12,
            bottom: 12,
            background: 'white',
            border: '1px solid rgba(0,0,0,0.1)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            padding: '8px 10px',
            borderRadius: 10,
            fontSize: 12,
            zIndex: 1200,
          }}
        >
          Data load error: {error}
        </div>
      )}
    </div>
  );
}
