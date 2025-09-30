'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Pane,
  Marker,
  Popup,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L, { DivIcon, LatLngExpression } from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';

import CouncilLayer from '@/components/CouncilLayer';
import HeatLayer from '@/components/HeatLayer';

/* ----------------------------- Types ----------------------------- */

type Station = {
  id: string | number | null;
  name: string | null;
  addr: string | null;
  postcode: string | null;
  lat: number;
  lon: number; // NOTE: API uses "lon"
  connectors: number;
  reports: number;
  downtime: number; // mins
  source: string;   // e.g., "osm"
};

type HeatOptions = Partial<{
  radius: number;
  blur: number;
  minOpacity: number;
  maxIntensity: number;
}>;

type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;

  showHeatmap?: boolean;
  showMarkers?: boolean;
  showCouncil?: boolean;

  heatOptions?: HeatOptions;

  onStationsCount?: (n: number) => void;
};

/* ------------------------ Small utilities ------------------------ */

function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function readInitialFromURL() {
  if (typeof window === 'undefined') return null;
  const qs = new URLSearchParams(window.location.search);
  const latS = qs.get('lat');
  const lngS = qs.get('lng') ?? qs.get('lon');
  const zS = qs.get('z') ?? qs.get('zoom');

  const lat = latS ? Number(latS) : NaN;
  const lng = lngS ? Number(lngS) : NaN;
  const z = zS ? Number(zS) : NaN;

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      center: [lat, lng] as [number, number],
      zoom: Number.isFinite(z) ? z : undefined,
    };
  }
  return null;
}

/* --------------------- Data fetch (stations) --------------------- */

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

/* --------------------- Map ready / initial view ------------------ */

function MapReadyFix({
  fallbackCenter,
  fallbackZoom,
}: {
  fallbackCenter: [number, number];
  fallbackZoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    // Ensure Leaflet recalculates container size to avoid “world strip” rendering
    map.whenReady(() => {
      map.invalidateSize();

      // If URL has explicit lat/lng, honor it; otherwise force our fallback
      const parsed = readInitialFromURL();
      if (parsed?.center) {
        const z = typeof parsed.zoom === 'number' ? parsed.zoom : fallbackZoom;
        map.setView(parsed.center, z, { animate: false });
      } else {
        map.setView(fallbackCenter, fallbackZoom, { animate: false });
      }
    });
  }, [map, fallbackCenter, fallbackZoom]);

  return null;
}

/* -------------------- Marker icon (CSS circle) ------------------- */

const blueDotIcon: DivIcon = L.divIcon({
  className: 'ev-pin', // styles injected below
  html: '',            // empty, purely CSS
  iconSize: [14, 14],
  iconAnchor: [7, 7],  // center the dot
  popupAnchor: [0, -9],
  tooltipAnchor: [0, -9],
});

/* --------------------------- Component --------------------------- */

export default function ClientMap({
  initialCenter = [51.509, -0.118],
  initialZoom = 12,
  showHeatmap = true,
  showMarkers = true,
  showCouncil = true,
  heatOptions,
  onStationsCount,
}: Props) {
  // If URL has center/zoom, we’ll use that; otherwise fall back to props
  const parsed = typeof window !== 'undefined' ? readInitialFromURL() : null;
  const startCenter = (parsed?.center ?? initialCenter) as LatLngExpression;
  const startZoom = parsed?.zoom ?? initialZoom;

  const [stations, setStations] = useState<Station[]>([]);

  useEffect(() => {
    onStationsCount?.(stations.length);
  }, [stations.length, onStationsCount]);

  // Precompute clusterer options + popup / tooltip
  const clusterOptions = useMemo(
    () => ({
      showCoverageOnHover: false,
      chunkedLoading: true,
      spiderfyOnEveryZoom: true,
      maxClusterRadius: 60,
      iconCreateFunction: (cluster: any) => {
        const count = cluster.getChildCount();
        // Simple, clean cluster bubble via CSS
        return L.divIcon({
          html: `<div class="ev-cluster-badge">${count}</div>`,
          className: 'ev-cluster',
          iconSize: [36, 36],
        });
      },
    }),
    []
  );

  // Heat points for <HeatLayer>
  type HeatPoint = [number, number, number];
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
    <div className="w-full h-[70vh]" style={{ position: 'relative' }}>
      {/* Global styles for our custom marker & cluster */}
      <style jsx global>{`
        .ev-pin {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #2d7ff9;           /* blue fill */
          border: 2px solid #ffffff;      /* white ring */
          box-shadow: 0 0 0 2px #2d7ff93a;/* subtle glow */
        }
        .ev-cluster {
          background: transparent;
          border: none;
        }
        .ev-cluster-badge {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #ffffffee;
          color: #1b3a6b;
          font-weight: 700;
          border: 3px solid #2d7ff9;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
        }
        .leaflet-popup-content {
          margin: 8px 10px;
        }
      `}</style>

      <MapContainer
        center={startCenter}
        zoom={startZoom}
        className="w-full h-full rounded-xl overflow-hidden"
        // keep this key stable so map keeps its state between rerenders
      >
        {/* Ensure proper initial view & prevent “world strip” */}
        <MapReadyFix fallbackCenter={initialCenter} fallbackZoom={initialZoom} />

        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Fetch stations as map moves */}
        <StationsFetcher enabled={true} onData={setStations} />

        {/* Council polygons (under markers, above tiles) */}
        {showCouncil && <CouncilLayer enabled />}

        {/* Heatmap under markers */}
        {showHeatmap && heatPoints.length > 0 && (
          <HeatLayer
            points={heatPoints}
            options={{
              radius: heatOptions?.radius ?? 24,
              blur: heatOptions?.blur ?? 22,
              minOpacity: heatOptions?.minOpacity ?? 0.35,
              max: heatOptions?.maxIntensity ?? 1.0,
            }}
          />
        )}

        {/* Markers / clustering */}
        {showMarkers && (
          <>
            <Pane name="stations-pane" style={{ zIndex: 400 }} />
            <MarkerClusterGroup {...clusterOptions}>
              {stations.map((s, i) => {
                const pos: [number, number] = [s.lat, s.lon];
                const key = `${s.id ?? i}-${s.lat}-${s.lon}`;
                return (
                  <Marker key={key} position={pos} icon={blueDotIcon}>
                    {(s.name || s.addr) && (
                      <Tooltip direction="top" offset={[0, -8]} opacity={1}>
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
                    <Popup>
                      <div style={{ minWidth: 260 }}>
                        <h4 style={{ margin: '0 0 6px' }}>Station details</h4>
                        <table style={{ width: '100%', fontSize: 13, lineHeight: 1.4 }}>
                          <tbody>
                            <tr>
                              <td style={{ opacity: 0.7, width: 90 }}>Name</td>
                              <td>{s.name ?? '—'}</td>
                            </tr>
                            <tr>
                              <td style={{ opacity: 0.7 }}>Address</td>
                              <td>{s.addr ?? '—'}</td>
                            </tr>
                            <tr>
                              <td style={{ opacity: 0.7 }}>Postcode</td>
                              <td>{s.postcode ?? '—'}</td>
                            </tr>
                            <tr>
                              <td style={{ opacity: 0.7 }}>Source</td>
                              <td>{s.source ?? '—'}</td>
                            </tr>
                            <tr>
                              <td style={{ opacity: 0.7 }}>Connectors</td>
                              <td>{Number.isFinite(s.connectors) ? s.connectors : 0}</td>
                            </tr>
                            <tr>
                              <td style={{ opacity: 0.7 }}>Reports</td>
                              <td>{Number.isFinite(s.reports) ? s.reports : 0}</td>
                            </tr>
                            <tr>
                              <td style={{ opacity: 0.7 }}>Downtime (mins)</td>
                              <td>{Number.isFinite(s.downtime) ? s.downtime : 0}</td>
                            </tr>
                            <tr>
                              <td style={{ opacity: 0.7 }}>Coordinates</td>
                              <td>
                                {Number(s.lat).toFixed(6)}, {Number(s.lon).toFixed(6)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <div style={{ marginTop: 10 }}>
                          <a
                            className="leaflet-control-zoom-in"
                            href={`https://www.google.com/maps?q=${s.lat},${s.lon}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-block',
                              background: '#2d7ff9',
                              color: '#fff',
                              padding: '6px 10px',
                              borderRadius: 6,
                              textDecoration: 'none',
                              fontSize: 13,
                              fontWeight: 600,
                            }}
                          >
                            Open in Google Maps
                          </a>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MarkerClusterGroup>
          </>
        )}
      </MapContainer>
    </div>
  );
}
