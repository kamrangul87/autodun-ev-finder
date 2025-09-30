'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
  Pane,
  Marker,
  Popup,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import MarkerClusterGroup from 'react-leaflet-cluster';

import CouncilLayer from '@/components/CouncilLayer';
import HeatLayer from '@/components/HeatLayer';
import SearchControl from '@/components/SearchControl';

// ---------- Types ----------
type Station = {
  id: string | number | null;
  name: string | null;
  addr: string | null;
  postcode: string | null;
  lat: number;
  lon: number; // NOTE: backend uses "lon"
  connectors: number;
  reports: number;
  downtime: number;
  source: string;
};

type HeatOptions = {
  radius?: number;
  blur?: number;
  minOpacity?: number;
  /** weight multiplier we apply when building points (not a leaflet.heat option) */
  intensity?: number;
  /** leaflet.heat accepts these; include them so TS doesn't complain */
  maxZoom?: number;
  max?: number;
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
        // Your route expects separate params: west,south,east,north,zoom
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

          // Contract: { items: Station[] }
          const items: Station[] = Array.isArray(json?.items) ? json.items : [];
          // Keep only valid coordinates
          const clean = items.filter(
            (s) => Number.isFinite(s.lat) && Number.isFinite(s.lon),
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
    [enabled, map],
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

// ---------- URL view sync ----------
function ViewUrlSync() {
  const map = useMap();
  useMapEvents({
    moveend: () => {
      if (typeof window === 'undefined') return;
      const c = map.getCenter();
      const z = map.getZoom();
      const sp = new URLSearchParams(location.search);
      sp.set('lat', c.lat.toFixed(6));
      sp.set('lng', c.lng.toFixed(6));
      sp.set('z', String(z));
      history.replaceState(null, '', `${location.pathname}?${sp.toString()}`);
    },
  });
  return null;
}

// ---------- Station detail side-panel ----------
function InfoPanel({
  station,
  onClose,
}: {
  station: Station | null;
  onClose: () => void;
}) {
  if (!station) return null;
  const { name, addr, postcode, connectors, reports, downtime, source, lat, lon } =
    station;

  const gmaps = `https://maps.google.com/?q=${lat},${lon}`;
  return (
    <div className="absolute right-3 top-16 z-[1001] w-[340px] rounded-lg bg-white/95 p-4 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Station details</h3>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-xs hover:bg-gray-100"
        >
          Close
        </button>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="opacity-70">Name</span>
          <span>{name || 'EV Charging'}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Address</span>
          <span>{addr || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Postcode</span>
          <span>{postcode || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Source</span>
          <span>{source || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Connectors</span>
          <span>{Number(connectors || 0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Reports</span>
          <span>{Number(reports || 0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Downtime (mins)</span>
          <span>{Number(downtime || 0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-70">Coordinates</span>
          <span>
            {lat.toFixed(6)}, {lon.toFixed(6)}
          </span>
        </div>
        <a
          href={gmaps}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block rounded bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500"
        >
          Open in Google Maps
        </a>
      </div>
    </div>
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
  // read initial center/zoom from URL if present
  let initCenter = initialCenter;
  let initZoom = initialZoom;
  if (typeof window !== 'undefined') {
    const sp = new URLSearchParams(location.search);
    const lat = Number(sp.get('lat'));
    const lng = Number(sp.get('lng'));
    const z = Number(sp.get('z'));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      initCenter = [lat, lng] as [number, number];
    }
    if (Number.isFinite(z)) initZoom = z;
  }

  const [stations, setStations] = useState<Station[]>([]);
  const [selected, setSelected] = useState<Station | null>(null);

  // keep your header counter in sync
  useEffect(() => {
    onStationsCount?.(stations.length);
  }, [stations.length, onStationsCount]);

  // Build heatmap points [lat, lon, weight] from stations
  type HeatPoint = [number, number, number];
  const heatPoints = useMemo<HeatPoint[]>(() => {
    const mult = Number(heatOptions?.intensity ?? 1);
    return (stations ?? [])
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon))
      .map((s) => {
        // weight by connectors; clamp to [0.2, 1]
        const base = Number(s.connectors ?? 1);
        let w = Math.max(0.2, Math.min(1, base / 4));
        w = Math.max(0, Math.min(1, w * mult));
        return [Number(s.lat), Number(s.lon), w] as HeatPoint;
      });
  }, [stations, heatOptions?.intensity]);

  return (
    <div className="w-full h-[70vh]" style={{ position: 'relative' }}>
      <MapContainer
        center={initCenter}
        zoom={initZoom}
        className="w-full h-full rounded-xl overflow-hidden"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* URL sync for center/zoom */}
        <ViewUrlSync />

        {/* search box */}
        <SearchControl />

        {/* fetch stations on move/zoom using your locked server API */}
        <StationsFetcher enabled={true} onData={setStations} />

        {/* council polygons (under markers, above tiles) */}
        {showCouncil && <CouncilLayer enabled />}

        {/* heatmap UNDER markers */}
        {showHeatmap && heatPoints.length > 0 && (
          <HeatLayer
            points={heatPoints}
            options={{
              radius: heatOptions?.radius ?? 45,
              blur: heatOptions?.blur ?? 25,
              minOpacity: heatOptions?.minOpacity ?? 0.35,
              maxZoom: 17,
              max: 1.0,
            }}
          />
        )}

        {/* markers (clustered) */}
        {showMarkers && (
          <>
            <Pane name="stations-pane" style={{ zIndex: 400 }} />
            <MarkerClusterGroup
              chunkedLoading
              spiderfyOnEveryZoom
              showCoverageOnHover={false}
              zoomToBoundsOnClick
              polygonOptions={{ color: '#1976d2', weight: 1, opacity: 0.6 }}
            >
              {stations.map((s, i) => (
                <Marker
                  key={`st-${s.id ?? i}`}
                  position={[s.lat, s.lon]}
                  eventHandlers={{
                    click: () => setSelected(s),
                  }}
                >
                  {(s.name || s.addr) && (
                    <Popup>
                      <div style={{ fontSize: 13 }}>
                        {s.name && (
                          <div>
                            <strong>{s.name}</strong>
                          </div>
                        )}
                        {s.addr && <div>{s.addr}</div>}
                      </div>
                    </Popup>
                  )}
                </Marker>
              ))}
            </MarkerClusterGroup>
          </>
        )}
      </MapContainer>

      {/* side panel for station details */}
      <InfoPanel station={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
