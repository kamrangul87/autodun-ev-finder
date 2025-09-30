'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
  Marker,
  Tooltip,
  Pane,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';

import CouncilLayer from '@/components/CouncilLayer';
import HeatLayer from '@/components/HeatLayer';

/* --------------------------------- Types --------------------------------- */
export type Station = {
  id: string | number | null;
  name: string | null;
  addr: string | null;
  postcode: string | null;
  lat: number;
  lon: number; // NOTE: server returns "lon"
  connectors: number | null;
  reports: number | null;
  downtime: number | null;
  source: string | null;
};

export type HeatOptions = {
  /** Multiplies each station weight; 1 = unchanged */
  intensity?: number;
  /** (The rest are handled inside HeatLayer; we keep intensity here) */
};

type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;

  showHeatmap?: boolean;
  showMarkers?: boolean;
  showCouncil?: boolean;

  onStationsCount?: (n: number) => void;

  /** Optional heatmap options coming from sliders on the page */
  heatOptions?: HeatOptions;
};

/* ------------------------------- Utilities -------------------------------- */
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ---------------------- Fetch stations on move/zoom ----------------------- */
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

/* ----------------------------- Marker styling ----------------------------- */
/** Small blue dot used for single stations */
const DotIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:12px;height:12px;border-radius:9999px;
    background:#2b7bff;border:2px solid white;
    box-shadow:0 1px 3px rgba(0,0,0,.25);
  "></div>`,
  iconSize: L.point(12, 12, true),
  iconAnchor: [6, 6],
});

/** Cluster bubble */
const makeClusterIcon = (cluster: any) =>
  L.divIcon({
    html: `<div style="
      width:36px;height:36px;border-radius:9999px;
      display:flex;align-items:center;justify-content:center;
      background:rgba(33,114,229,.12);
      border:2px solid #2172e5;box-shadow:0 2px 6px rgba(0,0,0,.15);
      color:#0b3b91;font-weight:700;font-size:13px;
    "><span>${cluster.getChildCount()}</span></div>`,
    className: 'autodun-cluster',
    iconSize: L.point(36, 36, true),
  });

/* -------------------------- Station details panel ------------------------- */
function StationDetails({
  station,
  onClose,
}: {
  station: Station | null;
  onClose: () => void;
}) {
  if (!station) return null;
  const {
    name,
    addr,
    postcode,
    lat,
    lon,
    source,
    connectors,
    reports,
    downtime,
  } = station;

  const title = name ?? 'EV Charging';
  const address = addr ?? (postcode ? `— ${postcode}` : '—');
  const conns = Math.max(1, Number(connectors ?? 0));

  const mapsHref = `https://maps.google.com/?q=${encodeURIComponent(
    `${lat}, ${lon}`
  )}`;

  return (
    <div
      className="fixed right-3 top-3 z-[1100] w-[320px] max-w-[85vw]
                 rounded-xl bg-white/95 shadow-lg border border-black/5 p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Station details</h3>
        <button
          className="text-xs px-2 py-1 rounded bg-black/5 hover:bg-black/10"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div className="space-y-1 text-sm">
        <Row k="Name" v={title} />
        <Row k="Address" v={address} />
        <Row k="Postcode" v={postcode ?? '—'} />
        <Row k="Source" v={source ?? '—'} />
        <Row k="Connectors" v={String(conns)} />
        <Row k="Reports" v={String(reports ?? 0)} />
        <Row k="Downtime (mins)" v={String(downtime ?? 0)} />
        <Row k="Coordinates" v={`${lat.toFixed(6)}, ${lon.toFixed(6)}`} />

        <a
          href={mapsHref}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-2 text-xs px-3 py-1 rounded
                     bg-[#2172e5] text-white hover:opacity-90"
        >
          Open in Google Maps
        </a>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-black/70">{k}</span>
      <span className="font-medium text-right">{v}</span>
    </div>
  );
}

/* ------------------------------- Main map -------------------------------- */
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
  const [selected, setSelected] = useState<Station | null>(null);

  // keep the header counter updated
  useEffect(() => {
    onStationsCount?.(stations.length);
  }, [stations.length, onStationsCount]);

  // Build heatmap points [lat, lon, weight]
  type HeatPoint = [number, number, number];
  const heatPoints = useMemo<HeatPoint[]>(() => {
    const intensity = Math.max(0.1, Math.min(3, heatOptions?.intensity ?? 1));
    return (stations ?? [])
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon))
      .map((s) => {
        const base = Number(s.connectors ?? 1);
        // Normalize connectors to ~0.2..1
        let w = Math.max(0.2, Math.min(1, base / 4));
        w = Math.max(0.1, Math.min(1, w * intensity));
        return [Number(s.lat), Number(s.lon), w] as HeatPoint;
      });
  }, [stations, heatOptions?.intensity]);

  // Fade markers slightly if heatmap is on (less visual clutter)
  const markerOpacity = showHeatmap ? 0.75 : 1;

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

        {/* fetch stations on move/zoom */}
        <StationsFetcher enabled={true} onData={setStations} />

        {/* council polygons (under markers, above tiles) */}
        {showCouncil && <CouncilLayer enabled />}

        {/* heatmap UNDER markers */}
        {showHeatmap && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}

        {/* markers (clustered) */}
        {showMarkers && (
          <>
            <Pane name="stations-pane" style={{ zIndex: 400 }} />
            <MarkerClusterGroup
              chunkedLoading
              disableClusteringAtZoom={16}
              spiderfyOnMaxZoom
              spiderfyOnEveryZoom={false}
              zoomToBoundsOnClick
              showCoverageOnHover={false}
              maxClusterRadius={60}
              iconCreateFunction={makeClusterIcon}
            >
              {stations.map((s, i) => {
                const key = `${s.id ?? i}`;
                const pos: [number, number] = [s.lat, s.lon];
                const title = s.name ?? 'EV Charging';
                const address = s.addr ?? s.postcode ?? '';

                return (
                  <Marker
                    key={key}
                    position={pos}
                    icon={DotIcon}
                    pane="stations-pane"
                    eventHandlers={{
                      click: () => setSelected(s),
                    }}
                    opacity={markerOpacity}
                  >
                    {(title || address) && (
                      <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                        <div style={{ fontSize: 12 }}>
                          {title && (
                            <div>
                              <strong>{title}</strong>
                            </div>
                          )}
                          {address && <div>{address}</div>}
                        </div>
                      </Tooltip>
                    )}
                  </Marker>
                );
              })}
            </MarkerClusterGroup>
          </>
        )}
      </MapContainer>

      {/* side panel */}
      <StationDetails station={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
