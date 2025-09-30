'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Pane,
  Tooltip,
  useMap,
  useMapEvents,
  Marker,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';

import CouncilLayer from '@/components/CouncilLayer';
import HeatLayer from '@/components/HeatLayer';
import SearchControl from '@/components/SearchControl';
import StationPanel from '@/components/StationPanel';
import MapButtons from '@/components/MapButtons';

/* ---------- Types ---------- */
type Station = {
  id: string | number | null;
  name: string | null;
  addr: string | null;
  postcode: string | null;
  lat: number;
  lon: number; // upstream returns "lon"
  connectors: number;
  reports: number;
  downtime: number;
  source: string;
};

export type HeatOptions = {
  radius?: number;
  blur?: number;
  minOpacity?: number;
};

type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;

  showHeatmap?: boolean;
  showMarkers?: boolean;
  showCouncil?: boolean;

  heatOptions?: HeatOptions;

  onStationsCount?: (n: number) => void;
};

/* ---------- Utilities ---------- */
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ---------- Stations fetcher (follows the locked API) ---------- */
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

/* ---------- Small, crisp dot icon for markers (no image assets) ---------- */
const dotIcon = L.divIcon({
  className: 'ev-dot',
  html: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

/* ---------- Main component ---------- */
export default function ClientMap({
  initialCenter = [51.509, -0.118],
  initialZoom = 12,
  showHeatmap = false,
  showMarkers = true,
  showCouncil = true,
  heatOptions,
  onStationsCount,
}: Props) {
  const [stations, setStations] = useState<Station[]>([]);
  const [selected, setSelected] = useState<Station | null>(null);

  // keep header counter in sync
  useEffect(() => {
    onStationsCount?.(stations.length);
  }, [stations.length, onStationsCount]);

  // Heatmap points: [lat, lon, weight]
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
      {/* global CSS for dot markers */}
      <style jsx global>{`
        .ev-dot {
          background: radial-gradient(#2b72ff 35%, rgba(43, 114, 255, 0.35));
          border: 2px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 0 2px rgba(43, 114, 255, 0.35);
        }
      `}</style>

      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        className="w-full h-full rounded-xl overflow-hidden"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Search box (top-left) */}
        <SearchControl />

        {/* Fetch stations when moving/zooming */}
        <StationsFetcher enabled={true} onData={setStations} />

        {/* Council polygons under markers */}
        {showCouncil && <CouncilLayer enabled />}

        {/* Heatmap under markers */}
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

        {/* Markers with clustering */}
        {showMarkers && stations.length > 0 && (
          <>
            <Pane name="stations-pane" style={{ zIndex: 400 }} />
            <MarkerClusterGroup
              // chunked loading keeps map snappy
              chunkedLoading
              showCoverageOnHover={false}
              spiderfyDistanceMultiplier={1.2}
            >
              {stations.map((s, i) => (
                <Marker
                  key={`${s.id ?? i}`}
                  position={[s.lat, s.lon]}
                  icon={dotIcon}
                  eventHandlers={{
                    click: () => setSelected(s),
                  }}
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
                </Marker>
              ))}
            </MarkerClusterGroup>
          </>
        )}

        {/* Floating map actions */}
        <MapButtons resetCenter={initialCenter} resetZoom={initialZoom} />
      </MapContainer>

      {/* Side details panel */}
      {selected && (
        <StationPanel station={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
