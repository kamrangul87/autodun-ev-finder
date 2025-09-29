'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
  CircleMarker,
  Tooltip,
  Pane,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import CouncilLayer from '@/components/CouncilLayer';
import HeatLayer from '@/components/HeatLayer';

type Station = {
  id: string | number | null;
  name: string | null;
  addr: string | null;
  postcode: string | null;
  lat: number;
  lon: number;
  connectors: number;
  reports: number;
  downtime: number;
  source: string;
};

type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;
  showHeatmap?: boolean;
  showMarkers?: boolean;
  showCouncil?: boolean;
  onStationsCount?: (n: number) => void;
};

function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function StationsFetcher({
  enabled,
  onData,
  onLoading,
}: {
  enabled: boolean;
  onData: (items: Station[]) => void;
  onLoading: (loading: boolean) => void;
}) {
  const map = useMap();
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useMemo(
    () =>
      debounce(async () => {
        if (!enabled || !map) return;

        const b = map.getBounds();
        const z = map.getZoom();

        const params = new URLSearchParams({
          west: String(b.getWest()),
          south: String(b.getSouth()),
          east: String(b.getEast()),
          north: String(b.getNorth()),
          zoom: String(z),
        });

        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        try {
          onLoading(true);
          const res = await fetch(`/api/stations?${params.toString()}`, {
            signal: ac.signal,
            cache: 'no-store',
          });
          if (!res.ok) throw new Error(`stations ${res.status}`);
          const json = await res.json();

          const items: Station[] = Array.isArray(json?.items) ? json.items : [];
          const clean = items.filter(
            (s) => Number.isFinite(s.lat) && Number.isFinite(s.lon)
          );
          onData(clean);
        } catch (e: any) {
          if (e?.name !== 'AbortError') {
            console.error('Stations fetch failed:', e);
            onData([]);
          }
        } finally {
          if (abortRef.current === ac) abortRef.current = null;
          onLoading(false);
        }
      }, 350),
    [enabled, map]
  );

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useMapEvents({
    moveend: refetch,
    zoomend: refetch,
  });

  return null;
}

function StationsMarkers({ stations }: { stations: Station[] }) {
  const key = useMemo(() => `stations-${stations.length}`, [stations.length]);
  return (
    <>
      <Pane name="stations-pane" style={{ zIndex: 400 }} />
      {stations.map((s, i) => (
        <CircleMarker
          key={`${key}-${s.id ?? i}`}
          center={[s.lat, s.lon]}
          radius={6}
          weight={2}
          opacity={1}
          fillOpacity={0.9}
          pane="stations-pane"
        >
          {(s.name || s.addr) && (
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <div style={{ fontSize: 12 }}>
                {s.name && (
                  <div>
                    <strong>{s.name}</strong>
                  </div>
                )}
                {s.addr && <div>{s.addr}</div>}
              </div>
            </Tooltip>
          )}
        </CircleMarker>
      ))}
    </>
  );
}

export default function ClientMap({
  initialCenter = [51.509, -0.118],
  initialZoom = 12,
  showHeatmap = false,
  showMarkers = true,
  showCouncil = true,
  onStationsCount,
}: Props) {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    onStationsCount?.(stations.length);
  }, [stations.length, onStationsCount]);

  type HeatPoint = [number, number, number];
  const heatPoints = useMemo<HeatPoint[]>(() => {
    return (stations ?? [])
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon))
      .map((s) => {
        const base = Number(s.connectors ?? 1);
        const w = Math.max(0.2, Math.min(1, base / 4));
        return [Number(s.lat), Number(s.lon), w] as HeatPoint;
      });
  }, [stations]);

  return (
    <div className="w-full h-[70vh] relative">
      {/* subtle loading chip */}
      {loading && (
        <div className="absolute left-3 top-3 z-[1100] bg-white/90 rounded px-3 py-1 text-sm shadow">
          Loading stations…
        </div>
      )}

      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        className="w-full h-full rounded-xl overflow-hidden"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <StationsFetcher
          enabled={true}
          onData={setStations}
          onLoading={setLoading}
        />

        {showCouncil && <CouncilLayer enabled />}

        {showHeatmap && heatPoints.length > 0 && (
          <HeatLayer points={heatPoints} />
        )}

        {showMarkers && <StationsMarkers stations={stations} />}
      </MapContainer>
    </div>
  );
}
