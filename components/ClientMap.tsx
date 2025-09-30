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
  Marker,
  Popup,
} from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import MarkerClusterGroup from 'react-leaflet-cluster';
import CouncilLayer from '@/components/CouncilLayer';
import HeatLayer, { type HeatOptions } from '@/components/HeatLayer';
import SearchControl from '@/components/SearchControl';

// ---------- Types ----------
type Station = {
  id: string | number | null;
  name: string | null;
  addr: string | null;
  postcode: string | null;
  lat: number;
  lon: number; // NOTE: API returns "lon"
  connectors: number;
  reports: number;
  downtime: number;
  source: string;
};

type HeatPoint = [number, number, number];

type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;

  showHeatmap?: boolean;
  showMarkers?: boolean;
  showCouncil?: boolean;

  heatOptions?: HeatOptions;

  onStationsCount?: (n: number) => void;
};

// ---------- Small utilities ----------
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// --- A tiny dot icon for clustered Markers
const dotIcon = L.divIcon({
  className: 'ev-dot',
  html:
    '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#2B6CB0;border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// ---------- Fetcher that follows your locked API contract ----------
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

// ---------- Markers layer (clustered) ----------
function StationsCluster({ stations }: { stations: Station[] }) {
  // cluster key to force refresh on data length change
  const key = useMemo(() => `stations-${stations.length}`, [stations.length]);

  return (
    <MarkerClusterGroup
      key={key}
      chunkedLoading
      showCoverageOnHover={false}
      spiderfyOnMaxZoom={true}
      maxClusterRadius={45}
    >
      {stations.map((s, i) => {
        const pos: LatLngExpression = [s.lat, s.lon];
        return (
          <Marker key={`${key}-${s.id ?? i}`} position={pos} icon={dotIcon}>
            <Popup minWidth={280}>
              <div style={{ fontSize: 13, lineHeight: 1.25 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {s.name || 'EV Charging'}
                </div>
                <table style={{ width: '100%' }}>
                  <tbody>
                    <tr>
                      <td>Address</td>
                      <td style={{ textAlign: 'right' }}>{s.addr || '—'}</td>
                    </tr>
                    <tr>
                      <td>Postcode</td>
                      <td style={{ textAlign: 'right' }}>{s.postcode || '—'}</td>
                    </tr>
                    <tr>
                      <td>Source</td>
                      <td style={{ textAlign: 'right' }}>{s.source || '—'}</td>
                    </tr>
                    <tr>
                      <td>Connectors</td>
                      <td style={{ textAlign: 'right' }}>{s.connectors ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Reports</td>
                      <td style={{ textAlign: 'right' }}>{s.reports ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Downtime (mins)</td>
                      <td style={{ textAlign: 'right' }}>{s.downtime ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Coordinates</td>
                      <td style={{ textAlign: 'right' }}>
                        {s.lat.toFixed(6)}, {s.lon.toFixed(6)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <a
                  href={`https://maps.google.com/?q=${s.lat},${s.lon}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-block',
                    marginTop: 8,
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: '#1976d2',
                    color: '#fff',
                    textDecoration: 'none',
                  }}
                >
                  Open in Google Maps
                </a>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MarkerClusterGroup>
  );
}

// ---------- Main component ----------
export default function ClientMap({
  initialCenter = [51.509, -0.118],
  initialZoom = 12,
  showHeatmap = true,
  showMarkers = true,
  showCouncil = true,
  heatOptions,
  onStationsCount,
}: Props) {
  const [stations, setStations] = useState<Station[]>([]);

  // keep header counter in sync
  useEffect(() => {
    onStationsCount?.(stations.length);
  }, [stations.length, onStationsCount]);

  // Build heatmap points [lat, lon, weight] from stations
  const heatPoints = useMemo<HeatPoint[]>(() => {
    return (stations ?? [])
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon))
      .map((s) => {
        // weight by connectors; clamp to [0.2, 1]
        const base = Number(s.connectors ?? 1);
        const w = Math.max(0.2, Math.min(1, base / 4));
        return [Number(s.lat), Number(s.lon), w] as HeatPoint;
      });
  }, [stations]);

  return (
    <div className="w-full h-[70vh] relative">
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        className="w-full h-full rounded-xl overflow-hidden"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* search input overlay */}
        <SearchControl />

        {/* fetch stations on move/zoom using your locked server API */}
        <StationsFetcher enabled={true} onData={setStations} />

        {/* council polygons */}
        {showCouncil && <CouncilLayer enabled />}

        {/* heatmap UNDER markers */}
        {showHeatmap && heatPoints.length > 0 && (
          <HeatLayer
            points={heatPoints}
            options={{
              radius: heatOptions?.radius ?? 28,
              blur: heatOptions?.blur ?? 25,
              minOpacity: heatOptions?.minOpacity ?? 0.35,
            }}
          />
        )}

        {/* markers (clustered) */}
        {showMarkers && <StationsCluster stations={stations} />}
      </MapContainer>
    </div>
  );
}
