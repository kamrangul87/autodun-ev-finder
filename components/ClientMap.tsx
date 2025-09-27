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

/* ---------------- Types ---------------- */
type Station = {
  id: string | number;
  lat: number;
  lng: number;
  name?: string | null;
  addr?: string | null;
};

type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;

  // Parent-controlled toggles (as per your page.tsx)
  showHeatmap?: boolean;
  showMarkers?: boolean;
  showCouncil?: boolean;

  // Called whenever station count changes
  onStationsCount?: (n: number) => void;
};

/* ------------- Utilities --------------- */
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ----------- Stations Layer ------------ */
function StationsLayer({ stations = [] as Station[] }) {
  const key = useMemo(() => `stations-${stations.length}`, [stations.length]);

  return (
    <>
      {/* keep markers above polygons */}
      <Pane name="stations-pane" style={{ zIndex: 400 }} />
      {stations.map((s) => (
        <CircleMarker
          key={`${key}-${s.id}`}
          center={[s.lat, s.lng]}
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

/* ----------- Fetch-on-Bounds ------------ */
function StationsFetcher({
  enabled,
  onData,
}: {
  enabled: boolean;
  onData: (st: Station[]) => void;
}) {
  const map = useMap();
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useMemo(
    () =>
      debounce(async () => {
        if (!enabled) return;
        if (!map) return;

        const b = map.getBounds();
        const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;

        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        try {
          // NOTE: this assumes your existing stations endpoint already works.
          const url = `/api/stations?bbox=${encodeURIComponent(bbox)}`;
          const res = await fetch(url, { signal: ac.signal, cache: 'no-store' });
          if (!res.ok) throw new Error(`stations fetch ${res.status}`);
          const data = await res.json();

          // Normalize to Station[]
          // Adjust mapping if your API shape differs
          const stations: Station[] = (data?.stations || data || []).map((d: any, i: number) => ({
            id: d.id ?? i,
            lat: d.lat ?? d.latitude,
            lng: d.lng ?? d.longitude,
            name: d.name ?? d.title ?? null,
            addr: d.addr ?? d.address ?? null,
          })).filter((s: Station) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

          onData(stations);
        } catch (err) {
          if ((err as any)?.name !== 'AbortError') {
            console.error('Stations fetch failed:', err);
            onData([]);
          }
        } finally {
          if (abortRef.current === ac) abortRef.current = null;
        }
      }, 350),
    [enabled, map, onData]
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

/* -------------- Controls --------------- */
function LayerToggles({
  heatmapOn,
  markersOn,
  councilOn,
  stationsCount,
}: {
  heatmapOn: boolean;
  markersOn: boolean;
  councilOn: boolean;
  stationsCount: number;
}) {
  return (
    <div
      className="leaflet-top leaflet-right"
      style={{ pointerEvents: 'none', zIndex: 1000 }}
    >
      <div
        className="leaflet-control"
        style={{
          pointerEvents: 'auto',
          background: '#fff',
          padding: '6px 10px',
          borderRadius: 8,
          boxShadow:
            '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 14,
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: heatmapOn ? 1 : 0.5 }}>
          <input type="checkbox" checked={heatmapOn} readOnly />
          Heatmap
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: markersOn ? 1 : 0.5 }}>
          <input type="checkbox" checked={markersOn} readOnly />
          Markers
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: councilOn ? 1 : 0.5 }}>
          <input type="checkbox" checked={councilOn} readOnly />
          Council
        </label>

        <span style={{ opacity: 0.8 }}>stations: {stationsCount}</span>
      </div>
    </div>
  );
}

/* ---------------- Main ------------------ */
export default function ClientMap({
  initialCenter = [51.522, -0.126],
  initialZoom = 13,
  showHeatmap = false,
  showMarkers = true,
  showCouncil = false,
  onStationsCount,
}: Props) {
  const [stations, setStations] = useState<Station[]>([]);

  // keep parent counter in sync
  useEffect(() => {
    onStationsCount?.(stations.length);
  }, [stations.length, onStationsCount]);

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

        {/* fetch stations when map moves (does not change your API) */}
        <StationsFetcher enabled={true} onData={setStations} />

        {/* council polygons */}
        <CouncilLayer enabled={showCouncil} />

        {/* heatmap stub – safe no-op until you replace it */}
        {showHeatmap && <HeatmapLayer stations={stations} />}

        {/* markers */}
        {showMarkers && <StationsLayer stations={stations} />}

        {/* toggle bar mirrors current state */}
        <LayerToggles
          heatmapOn={!!showHeatmap}
          markersOn={!!showMarkers}
          councilOn={!!showCouncil}
          stationsCount={stations.length}
        />
      </MapContainer>
    </div>
  );
}

/* --------- Stub heatmap (replace later) --------- */
function HeatmapLayer(_props: { stations: Station[] }) {
  return null;
}
