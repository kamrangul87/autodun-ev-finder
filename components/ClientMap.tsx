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
import type { Feature, Geometry } from 'geojson';
import 'leaflet/dist/leaflet.css';

import CouncilLayer from '@/components/CouncilLayer';
import HeatLayer from '@/components/HeatmapWithScaling'; // your heat component that accepts { points, options? }
import SearchControl from '@/components/SearchControl';

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';

/* ----------------------- Types ----------------------- */
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

type HeatOptions = {
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

  onStationsCount?: (n: number) => void;

  /** Heat layer visual options */
  heatOptions?: HeatOptions;
};

/* --------------------- Utilities --------------------- */
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ---------------- Stations Fetcher ------------------- */
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

        // keep bbox mirrored in URL so CouncilLayer can re-use it
        try {
          const sp = new URLSearchParams(window.location.search);
          sp.set('bbox', `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`);
          const u = `${window.location.pathname}?${sp.toString()}`;
          window.history.replaceState(null, '', u);
        } catch {
          /* no-op */
        }

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

/* ---------------- Markers Layer ---------------------- */
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

/* --------------------- Main Map ---------------------- */
export default function ClientMap({
  initialCenter = [51.509, -0.118],
  initialZoom = 12,
  showHeatmap = true,
  showMarkers = true,
  showCouncil = true,
  onStationsCount,
  heatOptions,
}: Props) {
  const [stations, setStations] = useState<Station[]>([]);

  // Council selection (click a polygon)
  const [selectedCouncil, setSelectedCouncil] = useState<{
    name: string;
    geom: Geometry;
  } | null>(null);

  const filteredStations = useMemo(() => {
    if (!selectedCouncil?.geom) return stations;
    try {
      return stations.filter((s) =>
        booleanPointInPolygon(point([s.lon, s.lat]), selectedCouncil.geom as any)
      );
    } catch {
      return stations;
    }
  }, [stations, selectedCouncil]);

  useEffect(() => {
    onStationsCount?.(filteredStations.length);
  }, [filteredStations.length, onStationsCount]);

  type HeatPoint = [number, number, number];
  const heatPoints = useMemo<HeatPoint[]>(() => {
    return (filteredStations ?? [])
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon))
      .map((s) => {
        const base = Number(s.connectors ?? 1);
        const w = Math.max(0.2, Math.min(1, base / 4));
        return [Number(s.lat), Number(s.lon), w] as HeatPoint;
      });
  }, [filteredStations]);

  return (
    <div className="w-full h-[70vh] relative">
      {/* Selection chip */}
      {selectedCouncil && (
        <div className="absolute z-[1001] left-3 top-[76px] bg-white/90 rounded-md shadow px-3 py-1 text-sm">
          Filter: <strong>{selectedCouncil.name}</strong>{' '}
          <button
            className="ml-2 underline"
            onClick={() => setSelectedCouncil(null)}
            title="Clear council filter"
          >
            Clear
          </button>
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

        {/* Search box */}
        <SearchControl />

        {/* Fetch stations on move/zoom */}
        <StationsFetcher enabled={true} onData={setStations} />

        {/* Councils: click to filter */}
        {showCouncil && (
          <CouncilLayer
            enabled
            selectedName={selectedCouncil?.name ?? null}
            onPick={(name: string, feature: Feature<Geometry, any>) =>
              setSelectedCouncil({ name, geom: feature.geometry })
            }
          />
        )}

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

        {/* markers */}
        {showMarkers && <StationsMarkers stations={filteredStations} />}
      </MapContainer>
    </div>
  );
}
