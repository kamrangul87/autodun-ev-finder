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
import HeatLayer from '@/components/HeatLayer'; // accepts { points, options? }

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

export type HeatOptions = {
  radius?: number;     // px
  blur?: number;       // px
  minOpacity?: number; // 0..1
  max?: number;        // 0..1
  maxZoom?: number;    // Leaflet zoom
  boost?: number;      // multiplies station weight
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

// ---------- Small utilities ----------
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

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

// ---------- Markers layer ----------
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

// ---------- Main component ----------
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

  // keep the header counter in sync
  useEffect(() => {
    onStationsCount?.(stations.length);
  }, [stations.length, onStationsCount]);

  // Build heatmap points [lat, lon, weight] from stations
  type HeatPoint = [number, number, number];
  const heatPoints = useMemo<HeatPoint[]>(() => {
    const boost = Number(heatOptions?.boost ?? 1);
    return (stations ?? [])
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon))
      .map((s) => {
        // base weight by connectors; clamp to [0.2, 1]
        const base = Number(s.connectors ?? 1);
        const weighted = Math.max(0.2, Math.min(1, (base / 4) * boost));
        return [Number(s.lat), Number(s.lon), weighted] as HeatPoint;
      });
  }, [stations, heatOptions?.boost]);

  // Defaults for heat layer rendering
  const heatLayerOptions = useMemo(
    () => ({
      radius: heatOptions?.radius ?? 60,
      blur: heatOptions?.blur ?? 34,
      minOpacity: heatOptions?.minOpacity ?? 0.5,
      max: heatOptions?.max ?? 1.0,
      maxZoom: heatOptions?.maxZoom ?? 17,
    }),
    [
      heatOptions?.radius,
      heatOptions?.blur,
      heatOptions?.minOpacity,
      heatOptions?.max,
      heatOptions?.maxZoom,
    ]
  );

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

        {/* fetch stations on move/zoom using your locked server API */}
        <StationsFetcher enabled={true} onData={setStations} />

        {/* council polygons (under markers, above tiles) */}
        {showCouncil && <CouncilLayer enabled />}

        {/* heatmap UNDER markers */}
        {showHeatmap && heatPoints.length > 0 && (
          <HeatLayer points={heatPoints} options={heatLayerOptions as any} />
        )}

        {/* markers */}
        {showMarkers && <StationsMarkers stations={stations} />}
      </MapContainer>
    </div>
  );
}
