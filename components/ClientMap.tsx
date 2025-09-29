'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
  CircleMarker,
  Tooltip,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import CouncilLayer from '@/components/CouncilLayer';
import HeatLayer from '@/components/HeatLayer';

// ---------- Types ----------
type Station = {
  id: string | number | null;
  name: string | null;
  addr: string | null;
  postcode: string | null;
  lat: number;
  lon: number;            // NOTE: server returns "lon"
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

// ---------- Utils ----------
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// ---------- Fetcher ----------
function StationsFetcher({
  enabled,
  onData,
}: {
  enabled: boolean;
  onData: (items: Station[]) => void;
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

// ---------- Markers (on markerPane so polygons never hide them) ----------
function StationsMarkers({ stations }: { stations: Station[] }) {
  const key = useMemo(() => `stations-${stations.length}`, [stations.length]);

  return (
    <>
      {stations.map((s, i) => (
        <CircleMarker
          key={`${key}-${s.id ?? i}`}
          center={[s.lat, s.lon]}
          radius={6}
          weight={2}
          opacity={1}
          fillOpacity={0.9}
          pane="markerPane"                 // <-- crucial: always above polygon layers
          bubblingMouseEvents={false}
          pathOptions={{ color: '#1e73ff', fillColor: '#1e73ff' }}
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

// ---------- Main ----------
export default function ClientMap({
  initialCenter = [51.509, -0.118],
  initialZoom = 12,
  showHeatmap = false,
  showMarkers = true,
  showCouncil = true,
  onStationsCount,
}: Props) {
  const [stations, setStations] = useState<Station[]>([]);

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
    <div className="w-full h-[70vh]" style={{ position: 'relative' }}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        className="w-full h-full rounded-xl overflow-hidden"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Always fetch; toggle only controls rendering */}
        <StationsFetcher enabled={true} onData={setStations} />

        {/* Council polygons are drawn on a lower-z custom pane inside CouncilLayer */}
        {showCouncil && <CouncilLayer enabled />}

        {/* Heatmap UNDER markers */}
        {showHeatmap && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}

        {/* Markers on markerPane (independent of Council) */}
        {showMarkers && <StationsMarkers stations={stations} />}
      </MapContainer>
    </div>
  );
}
