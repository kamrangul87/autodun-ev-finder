'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L, { type Map as LeafletMap, type LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ---- Types ----
type Station = {
  id: string | number;
  lat: number;
  lng: number;
  name?: string | null;
  addr?: string | null;
  postcode?: string | null;
  connectors?: number;
  downtime?: number;
  reports?: number;
  powerKW?: number;
};

type StationsResponse = { items: Station[] };

// ---- Small helper: fetch JSON with cancellation ----
async function fetchJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${url}\n${text}`);
  }
  return res.json() as Promise<T>;
}

// ---- A child component that listens to map events and loads stations ----
function BboxDataLoader({
  onData,
  extraParams,
}: {
  onData: (items: Station[]) => void;
  extraParams?: Record<string, string | number | boolean>;
}) {
  const map = useMap();
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const loadForBounds = useCallback(
    (bounds: LatLngBounds) => {
      // Cancel any in-flight request
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();

      const qs = new URLSearchParams({
        west: String(sw.lng),
        south: String(sw.lat),
        east: String(ne.lng),
        north: String(ne.lat),
        ...(extraParams
          ? Object.fromEntries(
              Object.entries(extraParams).map(([k, v]) => [k, String(v)])
            )
          : {}),
      });

      const base = process.env.NEXT_PUBLIC_STATIONS_URL || '/api/stations';
      const url = `${base}?${qs.toString()}`;

      fetchJSON<StationsResponse>(url, ctrl.signal)
        .then((data) => onData(data.items ?? []))
        .catch((err) => {
          if (err?.name === 'AbortError') return; // ignore cancelled
          console.error('Stations fetch failed:', err);
          onData([]); // fail safe
        })
        .finally(() => {
          if (abortRef.current === ctrl) abortRef.current = null;
        });
    },
    [onData, extraParams]
  );

  useEffect(() => {
    // Initial load
    loadForBounds(map.getBounds());

    const trigger = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        loadForBounds(map.getBounds());
      }, 200);
    };

    map.on('moveend', trigger);
    map.on('zoomend', trigger);

    return () => {
      map.off('moveend', trigger);
      map.off('zoomend', trigger);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [map, loadForBounds]);

  return null; // no UI
}

// ---- Main page ----
const DEFAULT_CENTER: [number, number] = [51.5074, -0.1278]; // London
const DEFAULT_ZOOM = 12;

export default function Model1HeatmapPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [showMarkers, setShowMarkers] = useState(true);

  // OSM tile URL (allow override via env)
  const tileUrl =
    process.env.NEXT_PUBLIC_TILE_URL ||
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  // Marker icon fix (Leaflet asset paths under bundlers)
  useEffect(() => {
    // @ts-ignore override internal urls
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });
  }, []);

  // Any query params you want to forward to your /api/stations
  const extraParams = useMemo(
    () => ({
      source: 'osm', // or 'council' if your API supports it
      minPower: 0,
    }),
    []
  );

  const onMapCreated = useCallback((m: LeafletMap) => {
    // You can keep a ref/state if you need it later
    // setMap(m);
  }, []);

  return (
    <div className="w-full h-[calc(100vh-120px)] relative">
      {/* Simple top-right controls */}
      <div className="absolute z-[1000] right-3 top-3 bg-white/90 rounded-xl shadow p-2 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showMarkers}
            onChange={(e) => setShowMarkers(e.target.checked)}
          />
          Show markers
        </label>
      </div>

      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        whenCreated={(leafletMap) => {
          // ✅ Correct callback type; avoids the previous whenReady TS error
          onMapCreated(leafletMap);
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url={tileUrl}
        />

        {/* Loads stations for current bounds and pushes into state */}
        <BboxDataLoader onData={setStations} extraParams={extraParams} />

        {/* Basic markers (toggleable) */}
        {showMarkers &&
          stations.map((s) => (
            <Marker key={String(s.id)} position={[s.lat, s.lng]}>
              <Popup>
                <div style={{ minWidth: 200 }}>
                  <strong>{s.name || 'Charging Location'}</strong>
                  <div>{s.addr || s.postcode || '—'}</div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                    Connectors: {s.connectors ?? 'n/a'} · Power: {s.powerKW ?? 'n/a'} kW
                    <br />
                    Reports: {s.reports ?? 0} · Downtime: {s.downtime ?? 0}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
