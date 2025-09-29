'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Pane,
  useMap,
  useMapEvents,
  Marker,
  Tooltip as RLTooltip,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import CouncilLayer from '@/components/CouncilLayer';
import HeatLayer from '@/components/HeatLayer';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L, { DivIcon } from 'leaflet';
import StationPanel from '@/components/StationPanel';

// ---------- Types ----------
type Station = {
  id: string | number | null;
  name: string | null;
  addr: string | null;
  postcode: string | null;
  lat: number;
  lon: number; // server returns "lon"
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

// ---------- Utilities ----------
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// nice blue dot as a DivIcon
function circleDivIcon(size = 12, color = '#1e90ff'): DivIcon {
  const d = size * 2;
  const html = `<span style="
    display:block;width:${d}px;height:${d}px;border-radius:50%;
    background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25);
  "></span>`;
  return L.divIcon({ html, className: '', iconSize: [d, d], iconAnchor: [size, size] });
}

// cluster bubble with count
function clusterDivIcon(count: number): DivIcon {
  const s = count < 10 ? 32 : count < 100 ? 38 : 46;
  const html = `<div style="
    display:flex;align-items:center;justify-content:center;
    width:${s}px;height:${s}px;border-radius:9999px;
    color:#fff;background:#2563eb;border:2px solid #fff;
    box-shadow:0 0 0 1px rgba(0,0,0,.25);font:600 12px/1.2 system-ui,Arial;
  ">${count}</div>`;
  return L.divIcon({ html, className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
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
          const clean = items.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
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

// ---------- Markers (clustered) ----------
function StationsMarkers({
  stations,
  onSelect,
}: {
  stations: Station[];
  onSelect: (s: Station) => void;
}) {
  const icon = useMemo(() => circleDivIcon(12, '#1e90ff'), []);
  const clusterIconFn = useMemo(
    () => (cluster: any) => clusterDivIcon(cluster.getChildCount()),
    []
  );

  return (
    <>
      <Pane name="stations-pane" style={{ zIndex: 400 }} />
      <MarkerClusterGroup
        chunkedLoading
        pane="stations-pane"
        maxClusterRadius={55}
        spiderfyOnEveryZoom={false}
        showCoverageOnHover={false}
        iconCreateFunction={clusterIconFn}
      >
        {stations.map((s, i) => (
          <Marker
            key={`st-${s.id ?? i}`}
            position={[s.lat, s.lon]}
            icon={icon}
            eventHandlers={{ click: () => onSelect(s) }}
          >
            {(s.name || s.addr) && (
              <RLTooltip direction="top" offset={[0, -6]} opacity={1}>
                <div style={{ fontSize: 12 }}>
                  {s.name && (
                    <div>
                      <strong>{s.name}</strong>
                    </div>
                  )}
                  {s.addr && <div>{s.addr}</div>}
                </div>
              </RLTooltip>
            )}
          </Marker>
        ))}
      </MarkerClusterGroup>
    </>
  );
}

// ---------- Main ----------
export default function ClientMap({
  initialCenter = [51.509, -0.118],
  initialZoom = 12,
  showHeatmap = true,
  showMarkers = true,
  showCouncil = true,
  onStationsCount,
}: Props) {
  const [stations, setStations] = useState<Station[]>([]);
  const [selected, setSelected] = useState<Station | null>(null);

  // Keep header counter in sync
  useEffect(() => {
    onStationsCount?.(stations.length);
  }, [stations.length, onStationsCount]);

  // Build heatmap points [lat, lon, weight]
  type HeatPoint = [number, number, number];
  const heatPoints = useMemo<HeatPoint[]>(() => {
    return stations.map((s) => {
      const base = Number(s.connectors ?? 1);
      const w = Math.max(0.2, Math.min(1, base / 4));
      return [Number(s.lat), Number(s.lon), w] as HeatPoint;
    });
  }, [stations]);

  return (
    <div className="relative w-full h-[70vh]">
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        className="w-full h-full rounded-xl overflow-hidden"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* fetch stations on move/zoom */}
        <StationsFetcher enabled={true} onData={setStations} />

        {/* council polygons (under markers, above tiles) */}
        {showCouncil && <CouncilLayer enabled />}

        {/* heatmap UNDER markers */}
        {showHeatmap && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}

        {/* clustered markers */}
        {showMarkers && (
          <StationsMarkers stations={stations} onSelect={(s) => setSelected(s)} />
        )}
      </MapContainer>

      {/* right-side info panel */}
      <StationPanel station={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
