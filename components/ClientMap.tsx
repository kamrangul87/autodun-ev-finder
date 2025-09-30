// components/ClientMap.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Pane, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import HeatmapWithScaling from '@/components/HeatmapWithScaling';
import ClusterLayer from '@/components/ClusterLayer';
import CouncilLayer from '@/components/CouncilLayer';
// at top
import { fixLeafletIcons } from '@/lib/leaflet-setup';

// inside component body, run once
useEffect(() => {
  fixLeafletIcons();
}, []);


type Station = {
  id: number | string;
  name?: string;
  address?: string;
  postcode?: string;
  lat: number;
  lng: number;
  connectors?: number;
};

type HeatPoint = { lat: number; lng: number; value: number };

type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;
};

const DEFAULT_CENTER: [number, number] = [51.5072, -0.1276];
const DEFAULT_ZOOM = 11;

/* ----------------------------- helpers ---------------------------------- */

function haversineKm(a: [number, number], b: [number, number]) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s1 =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(s1), Math.sqrt(1 - s1));
  return R * c;
}

/** OCM query radius (km) depends on zoom */
function distanceKmForZoom(z: number): number {
  if (z >= 15) return 3;
  if (z >= 14) return 5;
  if (z >= 13) return 9;
  if (z >= 12) return 16;
  if (z >= 11) return 26;
  if (z >= 10) return 42;
  return 60;
}

/** Heat radius scales with zoom so it looks consistent */
function heatRadiusForZoom(z: number, base: number): number {
  if (z >= 15) return Math.max(6, Math.round(base * 0.55));
  if (z >= 14) return Math.max(6, Math.round(base * 0.7));
  if (z >= 13) return Math.round(base * 0.85);
  if (z >= 12) return Math.round(base * 1.0);
  if (z >= 11) return Math.round(base * 1.2);
  return Math.round(base * 1.45);
}

/** v4-friendly helper to hand the Leaflet map back to parent once */
function MapInit({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/* ---------------------------- component --------------------------------- */

export default function ClientMap({
  initialCenter = DEFAULT_CENTER,
  initialZoom = DEFAULT_ZOOM,
}: Props) {
  const mapRef = useRef<LeafletMap | null>(null);

  // UI toggles
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showCouncil, setShowCouncil] = useState(true);
  const [intensity, setIntensity] = useState(1);
  const [radius, setRadius] = useState(18);
  const [blur, setBlur] = useState(0.35);
  const [query, setQuery] = useState('');

  // Data
  const [stations, setStations] = useState<Station[]>([]);
  const [stationsMsg, setStationsMsg] = useState<string>('—');
  const [error, setError] = useState<string | null>(null);

  // Track map view to manage re-fetch + heat scaling
  const [mapZoom, setMapZoom] = useState(initialZoom);
  const [mapCenter, setMapCenter] =
    useState<[number, number]>(initialCenter);

  const lastFetchPos = useRef<[number, number]>(initialCenter);
  const inFlight = useRef<AbortController | null>(null);
  const lastFetchAt = useRef<number>(0);

  const heatPoints: HeatPoint[] = useMemo(
    () =>
      stations.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        value: s.connectors ?? 1,
      })),
    [stations]
  );

  const heatRadius = useMemo(
    () => heatRadiusForZoom(mapZoom, radius),
    [mapZoom, radius]
  );

  // Called when we get the map instance
  const handleCreated = (m: LeafletMap) => {
    mapRef.current = m;

    const updateFromMap = () => {
      const c = m.getCenter();
      const z = m.getZoom();
      setMapCenter([c.lat, c.lng]);
      setMapZoom(z);
    };

    updateFromMap();
    m.on('moveend zoomend', updateFromMap);

    // initial fetch
    setTimeout(() => refetchIfNeeded(true), 0);
  };

  /** Fetch OCM data near (lat, lng) with zoom-aware distance */
  const fetchStations = async (lat: number, lng: number, z: number) => {
    inFlight.current?.abort();
    const ac = new AbortController();
    inFlight.current = ac;

    try {
      const distKm = distanceKmForZoom(z);
      const url =
        `/api/ocm?lat=${lat}&lng=${lng}` +
        `&distance=${distKm}&maxresults=1200&countrycode=GB`;

      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      if (!Array.isArray(json)) throw new Error('Bad OCM response');

      const mapped: Station[] = json
        .map((p: any) => ({
          id:
            p?.ID ??
            `${p?.AddressInfo?.Latitude ?? ''},${p?.AddressInfo?.Longitude ?? ''}`,
          name: p?.AddressInfo?.Title ?? 'EV Charging',
          address: p?.AddressInfo?.AddressLine1 ?? '',
          postcode: p?.AddressInfo?.Postcode ?? '',
          lat: Number(p?.AddressInfo?.Latitude),
          lng: Number(p?.AddressInfo?.Longitude),
          connectors: Array.isArray(p?.Connections)
            ? p.Connections.length
            : 0,
        }))
        .filter(
          (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)
        );

      setStations(mapped);
      setStationsMsg(String(mapped.length));
      setError(null);
      lastFetchPos.current = [lat, lng];
      lastFetchAt.current = Date.now();
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setStations([]);
      setStationsMsg('0');
      setError(e?.message ?? 'Failed to load stations');
    }
  };

  /** Debounced conditional refetch */
  const refetchIfNeeded = (force = false) => {
    const now = Date.now();
    const elapsed = now - lastFetchAt.current;
    const movedKm = haversineKm(lastFetchPos.current, mapCenter);

    const z = mapZoom;
    const minMoveKm = z >= 14 ? 0.8 : z >= 12 ? 1.3 : 2.2;
    const minWaitMs = 600;

    if (force || movedKm > minMoveKm || elapsed > 4000) {
      fetchStations(mapCenter[0], mapCenter[1], z);
    } else {
      if (elapsed < minWaitMs) return;
    }
  };

  useEffect(() => {
    const t = setTimeout(() => refetchIfNeeded(false), 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapCenter[0], mapCenter[1], mapZoom]);

  // Simple Nominatim search
  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query.trim()
      )}&limit=1`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      const json = await res.json();
      if (Array.isArray(json) && json[0]) {
        const lat = parseFloat(json[0].lat);
        const lon = parseFloat(json[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          mapRef.current?.setView(
            [lat, lon],
            Math.max(13, mapRef.current?.getZoom() ?? 13)
          );
        }
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="map-root">
      {/* Controls */}
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
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <label>
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
              />{' '}
              Heatmap
            </label>
            <label>
              <input
                type="checkbox"
                checked={showMarkers}
                onChange={(e) => setShowMarkers(e.target.checked)}
              />{' '}
              Markers
            </label>
            <label>
              <input
                type="checkbox"
                checked={showCouncil}
                onChange={(e) => setShowCouncil(e.target.checked)}
              />{' '}
              Council
            </label>
            <span
              style={{
                marginLeft: 8,
                fontSize: 12,
                color: '#2f6b2f',
                fontWeight: 700,
              }}
            >
              Stations: {stationsMsg}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#444' }}>Intensity</span>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.5}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
            />
            <span style={{ fontSize: 12, color: '#444' }}>Radius</span>
            <input
              type="range"
              min={8}
              max={40}
              step={2}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            />
            <span style={{ fontSize: 12, color: '#444' }}>Blur</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={blur}
              onChange={(e) => setBlur(Number(e.target.value))}
            />
          </div>

          <form
            onSubmit={doSearch}
            style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}
          >
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

      {/* Map */}
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        className="leaflet-map"
        preferCanvas
        style={{ height: 'calc(100vh - 120px)' }}
      >
        {/* Hand back the Leaflet map instance in v4-safe way */}
        <MapInit onReady={handleCreated} />

        {/* Base */}
        <Pane name="base" style={{ zIndex: 100 }}>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors · Charging location data © Open Charge Map (CC BY 4.0)"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </Pane>

        {/* Heatmap above base, below markers */}
        {showHeatmap && (
          <Pane name="heatmap" style={{ zIndex: 260, pointerEvents: 'none' }}>
            <HeatmapWithScaling
              points={heatPoints}
              intensity={intensity}
              radius={heatRadius}
              blur={blur}
            />
          </Pane>
        )}

        {/* Council boundaries */}
        {showCouncil && (
          <Pane name="council" style={{ zIndex: 270, pointerEvents: 'none' }}>
            <CouncilLayer
              url="/data/council-test.geojson"
              color="#0ea5a5"
              fillColor="#06b6d4"
              fillOpacity={0.12}
              weight={2}
            />
          </Pane>
        )}

        {/* Cluster markers on top */}
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
