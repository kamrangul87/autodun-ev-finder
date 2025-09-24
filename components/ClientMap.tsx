'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import HeatLayer from './HeatLayer';

type Station = {
  id: string | number;
  lat: number;
  lng: number;
  name?: string | null;
  addr?: string | null;
  postcode?: string | null;
  powerKW?: number;
  connectors?: number;
};

type StationsResponse = { items: Station[] } | Station[];

async function fetchJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${url}\n${text}`);
  }
  return res.json() as Promise<T>;
}

function BboxLoader({
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
  const timerRef = useRef<number | null>(null);

  const load = useCallback(() => {
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

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
      .then((json) => {
        const items = Array.isArray(json) ? json : json.items ?? [];
        onData(
          items
            .map((s: any) => ({
              id: s.id ?? s.ID ?? `${s.lat ?? s.AddressInfo?.Latitude},${s.lng ?? s.AddressInfo?.Longitude}`,
              lat: s.lat ?? s.AddressInfo?.Latitude,
              lng: s.lng ?? s.AddressInfo?.Longitude,
              name: s.name ?? s.AddressInfo?.Title ?? null,
              addr: s.addr ?? s.AddressInfo?.AddressLine1 ?? null,
              postcode: s.postcode ?? s.AddressInfo?.Postcode ?? null,
              powerKW: s.powerKW ?? s.PowerKW ?? undefined,
              connectors: s.connectors ?? s.Connections?.length ?? undefined,
            }))
            .filter((s: Station) => typeof s.lat === 'number' && typeof s.lng === 'number')
        );
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.error('stations fetch failed:', err);
          onData([]);
        }
      });
  }, [map, onData, extraParams]);

  useEffect(() => {
    const trigger = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(load, debounceMs);
    };

    load(); // initial
    map.on('moveend', trigger);
    map.on('zoomend', trigger);

    return () => {
      map.off('moveend', trigger);
      map.off('zoomend', trigger);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [map, load, debounceMs]);

  return null;
}

export default function ClientMap({
  center,
  zoom,
  tileUrl,
}: {
  center: [number, number];
  zoom: number;
  tileUrl: string;
}) {
  const [stations, setStations] = useState<Station[]>([]);
  const [showHeat, setShowHeat] = useState(true);

  // Fix Leaflet marker icon URLs (client only)
  useEffect(() => {
    (async () => {
      const L = await import('leaflet');
      const proto = (L.Icon.Default.prototype as any);
      if (proto && proto._getIconUrl) delete proto._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl:
          'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl:
          'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });
    })();
  }, []);

  const heatPoints = useMemo<[number, number, number][]>(() => {
    // basic weight = 1 per station (plug in your own scoring later)
    return stations.map((s) => [s.lat, s.lng, 1] as [number, number, number]);
  }, [stations]);

  return (
    <div className="relative w-full h-full">
      <div className="absolute z-[1000] right-3 top-3 bg-white/90 rounded-xl shadow p-2 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showHeat} onChange={() => setShowHeat((v) => !v)} />
          {showHeat ? 'Heatmap' : 'Markers'}
        </label>
        <span className="text-xs text-gray-700">stations: {stations.length}</span>
      </div>

      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url={tileUrl} />
        <BboxLoader onData={setStations} />

        {showHeat ? (
          <HeatLayer points={heatPoints} />
        ) : (
          stations.map((s) => (
            <Marker key={String(s.id)} position={[s.lat, s.lng]}>
              <Popup>
                <div style={{ minWidth: 200 }}>
                  <strong>{s.name || 'Charging location'}</strong>
                  <div>{s.addr || s.postcode || '—'}</div>
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                    Connectors: {s.connectors ?? 'n/a'} · Power: {s.powerKW ?? 'n/a'} kW
                  </div>
                </div>
              </Popup>
            </Marker>
          ))
        )}
      </MapContainer>
    </div>
  );
}
