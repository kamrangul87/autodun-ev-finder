'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  Pane,
  Marker,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';

import CouncilLayer from '@/components/CouncilLayer';
import HeatLayer from '@/components/HeatLayer';
import SearchControl from '@/components/SearchControl';
import StationPanel from '@/components/StationPanel';

import L, { DivIcon } from 'leaflet';

/* ----------------------------- Types & helpers ---------------------------- */

type Station = {
  id: string | number | null;
  name: string | null;
  addr: string | null;
  postcode: string | null;
  lat: number;
  lon: number;          // NOTE: API returns "lon"
  connectors: number;
  reports: number;
  downtime: number;
  source: string;
};

type HeatOptions = {
  /** Leaflet.heat radius in pixels */
  radius?: number;
  /** Leaflet.heat blur in pixels */
  blur?: number;
  /** Leaflet.heat minOpacity (0..1) */
  minOpacity?: number;
  /** Extra multiplier applied to each point’s weight */
  intensity?: number;
};

type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;

  showHeatmap?: boolean;
  showMarkers?: boolean;
  showCouncil?: boolean;

  onStationsCount?: (n: number) => void;

  /** Optional heat layer tuning passed from the page */
  heatOptions?: HeatOptions;
};

// small debounce
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ----------------------------- Stations fetcher --------------------------- */

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

/* ------------------------------ Marker styling --------------------------- */

// tiny blue dot icon for single markers (so clustering looks nice)
const dotIcon: DivIcon = L.divIcon({
  className: 'ev-dot-icon',
  html:
    '<div style="width:12px;height:12px;border-radius:50%;' +
    'background:#2b70ff;box-shadow:0 0 0 2px #fff;opacity:0.95;"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

/* ------------------------------- Main map -------------------------------- */

export default function ClientMap({
  initialCenter = [51.509, -0.118],
  initialZoom = 12,
  showHeatmap = false,
  showMarkers = true,
  showCouncil = true,
  onStationsCount,
  heatOptions,
}: Props) {
  const [stations, setStations] = useState<Station[]>([]);
  const [selected, setSelected] = useState<Station | null>(null);

  // keep header counter in sync
  useEffect(() => {
    onStationsCount?.(stations.length);
  }, [stations.length, onStationsCount]);

  // Heat points: [lat, lon, weight]
  type HeatPoint = [number, number, number];
  const heatPoints = useMemo<HeatPoint[]>(() => {
    const boost = Number.isFinite(heatOptions?.intensity)
      ? Number(heatOptions?.intensity)
      : 1;
    return stations.map((s) => {
      const base = Number(s.connectors ?? 1);
      // scale: clamp into [0.2 .. 1.0] and apply boost
      const w = Math.max(0.2, Math.min(1, (base / 4) * boost));
      return [Number(s.lat), Number(s.lon), w] as HeatPoint;
    });
  }, [stations, heatOptions?.intensity]);

  // cluster options (keep UI clean)
  const clusterOptions = useMemo(
    () => ({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 17,
      maxClusterRadius: 55,
      iconCreateFunction(cluster: any) {
        const count = cluster.getChildCount();
        const size =
          count >= 100 ? 'xl' : count >= 50 ? 'lg' : count >= 20 ? 'md' : 'sm';
        const px =
          size === 'xl' ? 56 : size === 'lg' ? 46 : size === 'md' ? 36 : 30;
        const html = `
          <div style="
            width:${px}px;height:${px}px;border-radius:50%;
            background:#1e40af; color:#fff;
            display:flex;align-items:center;justify-content:center;
            border:3px solid #fff; box-shadow:0 2px 8px rgba(0,0,0,.25);
            font-weight:700; font-family:system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial;
          ">${count}</div>`;
        return L.divIcon({ html, className: 'ev-cluster', iconSize: [px, px] });
      },
    }),
    []
  );

  return (
    <div className="w-full h-[70vh] relative">
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        className="w-full h-full rounded-xl overflow-hidden"
        zoomControl={true}
        preferCanvas={true}
      >
        {/* Put the search box INSIDE the MapContainer so it can use useMap() */}
        <div className="absolute left-3 top-3 z-[1100] pointer-events-auto">
          <SearchControl />
        </div>

        <TileLayer
          // OSM standard tiles
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* fetch stations on move/zoom using your locked server API */}
        <StationsFetcher enabled={true} onData={setStations} />

        {/* council polygons (under markers, above tiles) */}
        {showCouncil && <CouncilLayer enabled />}

        {/* heatmap UNDER markers */}
        {showHeatmap && heatPoints.length > 0 && (
          <HeatLayer
            options={{
            points={heatPoints}
            radius={heatOptions?.radius ?? 28}
            blur={heatOptions?.blur ?? 25}
            minOpacity={heatOptions?.minOpacity ?? 0.35}
             }}
          />
        )}

        {/* markers / clusters */}
        {showMarkers && stations.length > 0 && (
          <>
            {/* ensure markers are above polygons */}
            <Pane name="stations-pane" style={{ zIndex: 400 }} />
            <MarkerClusterGroup {...clusterOptions}>
              {stations.map((s, idx) => {
                const key = `${s.id ?? idx}`;
                const pos: [number, number] = [Number(s.lat), Number(s.lon)];
                return (
                  <Marker
                    key={key}
                    position={pos}
                    icon={dotIcon}
                    eventHandlers={{
                      click: () => setSelected(s),
                    }}
                  />
                );
              })}
            </MarkerClusterGroup>
          </>
        )}
      </MapContainer>

      {/* Station details panel */}
      {selected ? (
        <StationPanel station={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
