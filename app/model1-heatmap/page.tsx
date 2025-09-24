'use client';

// prevent pre-render/SSG so no server tries to touch window
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// ---------- Types (kept minimal to avoid importing leaflet on server) ----------
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

// ---------- fetch helper with cancellation ----------
async function fetchJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${url}\n${text}`);
  }
  return res.json() as Promise<T>;
}

// ---------- Bounds-driven data loader (no whenCreated needed) ----------
function BboxDataLoader({
  onData,
  extraParams,
  debounceMs = 200,
}: {
  onData: (items: Station[]) => void;
  extraParams?: Record<string, string | number | boolean>;
  debounceMs?: number;
}) {
  const map = useMap();
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const loadForBounds = useCallback(
    (bounds: any) => {
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
          ? Object.fromEntries(Object.entries(extraParams).map(([k, v]) => [k, String(v)]))
          : {}),
      });

      const base = process.env.NEXT_PUBLIC_STATIONS_URL || '/api/stations';
      const url = `${base}?${qs.toString()}`;

      fetchJSON<StationsResponse>(url, ctrl.signal)
        .then((data) => onData(data.items ?? []))
        .catch((err) => {
          if ((err as any)?.name === 'AbortError') return;
          console.error('Stations fetch failed:', err);
          onData([]);
        })
        .finally(() => {
          if (abortRef.current === ctrl) abortRef.current = null;
        });
    },
    [onData, extraParams]
  );

  useEffect(() => {
    // Initial load once map is mounted
    loadForBounds(map.getBounds());

    const trigger = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        loadForBounds(map.getBounds());
      }, debounceMs);
    };

    map.on('moveend', trigger);
    map.on('zoomend', trigger);

    return () => {
      map.off('moveend', trigger);
      map.off('zoomend', trigger);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [map, loadForBounds, debounceMs]);

  return null;
}

// ---------- Page ----------
const DEFAULT_CENTER: [number, number] = [51.5074, -0.1278]; // London
const DEFAULT_ZOOM = 12;

export default function Model1HeatmapPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [showMarkers, setShowMarkers] = useState(true);

  const tileUrl =
    process.env.NEXT_PUBLIC_TILE_URL ||
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  // Fix Leaflet icon URLs under bundlers — dynamically import Leaflet only in the browser
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // only run in browser
      if (typeof window === 'undefined') return;
      const L = await import('leaflet');
      if (cancelled) return;

      const proto = (L.Icon.Default.prototype as any);
      if (proto && proto._getIconUrl) {
        delete proto._getIconUrl;
      }
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl:
          'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl:
          'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const extraParams = useMemo(
    () => ({
      source: 'osm', // swap to 'council' if your API supports it
      minPower: 0,
    }),
    []
  );

  return (
    <div className="w-full h-[calc(100vh-120px)] relative">
      {/* UI controls */}
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

      {/* Map (client-only) */}
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer attribution="&copy; OpenStreetMap contributors" url={tileUrl} />

        {/* Fetch stations by current bounds */}
        <BboxDataLoader onData={setStations} extraParams={extraParams} />

        {/* Markers */}
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
