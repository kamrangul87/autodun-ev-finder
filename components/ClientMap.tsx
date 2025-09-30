'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Pane, Marker, Popup, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import HeatmapWithScaling, { type HeatPoint } from '@/components/HeatmapWithScaling';

type Station = {
  id: number | string;
  name?: string;
  address?: string;
  postcode?: string;
  lat: number;
  lng: number;
  connectors?: number;
};

type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;
};

function EnsurePanes() {
  const map = useMap();
  React.useEffect(() => {
    const defs: Array<[string, number, ('auto' | 'none')?]> = [
      ['base', 100, 'auto'],
      ['heatmap', 200, 'auto'],
      ['markers', 300, 'auto'],
    ];
    defs.forEach(([name, z, pe]) => {
      const pane = map.getPane(name) ?? map.createPane(name);
      pane.style.zIndex = String(z);
      pane.style.pointerEvents = pe ?? 'auto';
    });
  }, [map]);
  return null;
}

export default function ClientMap({
  initialCenter = [51.5072, -0.1276],
  initialZoom = 10,
}: Props) {
  const mapRef = useRef<LeafletMap | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState<string | null>(null);

  // UI
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [intensity, setIntensity] = useState(1);
  const [radius, setRadius] = useState(18);
  const [blur, setBlur] = useState(0.35);

  // search
  const [query, setQuery] = useState('');
  const [searchPin, setSearchPin] = useState<[number, number] | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [lat, lng] = initialCenter;
        const res = await fetch(
          `/api/ocm?lat=${lat}&lng=${lng}&distance=25&maxresults=650&countrycode=GB`,
          { headers: { 'Content-Type': 'application/json' } }
        );
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        const mapped: Station[] = (Array.isArray(data) ? data : [])
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
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load stations');
        console.error('Stations fetch failed:', e);
      }
    };
    load();
  }, [initialCenter]);

  const heatPoints: HeatPoint[] = useMemo(
    () =>
      stations.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        value: Number.isFinite(s.connectors || 0) ? (s.connectors as number) : 1,
      })),
    [stations]
  );

  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query.trim()
      )}&limit=1`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const json = await res.json();
      if (Array.isArray(json) && json[0]) {
        const lat = parseFloat(json[0].lat);
        const lon = parseFloat(json[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          mapRef.current?.setView([lat, lon], 14);
          setSearchPin([lat, lon]);
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
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} />
              Heatmap
            </label>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} />
              Markers
            </label>
          </div>

          {/* Simple sliders */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#444' }}>Intensity</span>
            <input type="range" min={0.5} max={5} step={0.5} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
            <span style={{ fontSize: 12, color: '#444' }}>Radius</span>
            <input type="range" min={8} max={40} step={2} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
            <span style={{ fontSize: 12, color: '#444' }}>Blur</span>
            <input type="range" min={0} max={1} step={0.05} value={blur} onChange={(e) => setBlur(Number(e.target.value))} />
          </div>

          {/* Search bar */}
          <form onSubmit={doSearch} style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search address or place..."
              aria-label="Search"
              style={{
                width: 420,
                height: 36,
                borderRadius: 12,
                border: '1px solid rgba(0,0,0,0.12)',
                padding: '0 12px',
              }}
            />
            <button
              type="submit"
              style={{
                height: 36,
                padding: '0 14px',
                borderRadius: 12,
                border: '1px solid rgba(0,0,0,0.12)',
                background: '#fff',
              }}
            >
              Search
            </button>
          </form>
        </div>
      </div>

      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        ref={(ref) => {
          if (ref) mapRef.current = ref;
        }}
        className="leaflet-map"
        preferCanvas
        style={{ height: 'calc(100vh - 120px)' }}
      >
        <EnsurePanes />

        <Pane name="base">
          <TileLayer
            attribution="&copy; OpenStreetMap contributors · Charging location data © Open Charge Map (CC BY 4.0)"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </Pane>

        {showHeatmap && (
          <Pane name="heatmap">
            <HeatmapWithScaling points={heatPoints} intensity={intensity} radius={radius} blur={blur} />
          </Pane>
        )}

        {showMarkers && (
          <Pane name="markers">
            {stations.map((s) => (
              <Marker key={s.id} position={[s.lat, s.lng]}>
                <Popup>
                  <div style={{ minWidth: 220 }}>
                    <strong>{s.name}</strong>
                    <div>{s.address}</div>
                    <div>{s.postcode}</div>
                    <div>Connectors: {s.connectors ?? 0}</div>
                    <div style={{ marginTop: 8 }}>
                      <a href={`https://maps.google.com/?q=${s.lat},${s.lng}`} target="_blank" rel="noreferrer">
                        Open in Google Maps
                      </a>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
            {searchPin && <Marker position={searchPin} />}
          </Pane>
        )}
      </MapContainer>

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
