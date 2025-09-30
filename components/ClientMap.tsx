'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Pane,
  Tooltip,
  Popup,
  Marker,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';

import CouncilLayer from '@/components/CouncilLayer';
import SearchControl from '@/components/SearchControl';
import StationPanel from '@/components/StationPanel';

// ✅ Import the heat layer AND its public types
import HeatLayer, {
  type Point as HeatPoint,
  type HeatOptions,
} from '@/components/HeatmapWithScaling';

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

  /** Optional heatmap tuning coming from the page controls */
  heatOptions?: HeatOptions;
};

// ---------- utils ----------
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Simple blue dot as a DivIcon (no image assets needed)
const dotIcon = L.divIcon({
  className: '', // avoid extra leaflet default classes
  html:
    '<span style="display:block;width:10px;height:10px;border:2px solid #2D6CDF;border-radius:50%;background:#2F80ED;box-shadow:0 0 0 2px rgba(255,255,255,0.9)"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// ---------- Fetcher that follows your API contract ----------
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

// ---------- Small controls (Locate / Reset) ----------
function LocateResetControls({
  homeCenter,
  homeZoom,
}: {
  homeCenter: [number, number];
  homeZoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    const Control = L.Control.extend({
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar');
        container.style.background = 'white';
        container.style.padding = '8px';
        container.style.borderRadius = '8px';
        container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '6px';

        const locate = L.DomUtil.create('button', '', container);
        locate.type = 'button';
        locate.textContent = '📍 Locate';
        locate.style.cursor = 'pointer';
        locate.style.padding = '6px 8px';
        locate.style.border = '1px solid #e5e7eb';
        locate.style.borderRadius = '6px';
        locate.style.background = '#fff';

        const reset = L.DomUtil.create('button', '', container);
        reset.type = 'button';
        reset.textContent = '↺ Reset';
        reset.style.cursor = 'pointer';
        reset.style.padding = '6px 8px';
        reset.style.border = '1px solid #e5e7eb';
        reset.style.borderRadius = '6px';
        reset.style.background = '#fff';

        L.DomEvent.on(locate, 'click', (e) => {
          L.DomEvent.stopPropagation(e);
          map.locate({ setView: true, maxZoom: 16 });
        });

        L.DomEvent.on(reset, 'click', (e) => {
          L.DomEvent.stopPropagation(e);
          map.setView(homeCenter, homeZoom);
        });

        return container;
      },
      onRemove: () => void 0,
    });

    const ctl = new Control({ position: 'bottomright' });
    map.addControl(ctl);
    return () => {
      map.removeControl(ctl);
    };
  }, [map, homeCenter, homeZoom]);

  return null;
}

// ---------- Main component ----------
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

  // Keep header counter in sync
  useEffect(() => {
    onStationsCount?.(stations.length);
  }, [stations.length, onStationsCount]);

  // Build heatmap points [lat, lon, weight] from stations (✅ typed from HeatmapWithScaling)
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

        {/* Fetch stations on move/zoom using your API */}
        <StationsFetcher enabled={true} onData={setStations} />

        {/* Council polygons (under markers, above tiles) */}
        {showCouncil && <CouncilLayer enabled />}

        {/* Heatmap under markers */}
        {showHeatmap && heatPoints.length > 0 && (
          <HeatLayer
            points={heatPoints}
            options={{
              radius: heatOptions?.radius ?? 28,
              blur: heatOptions?.blur ?? 25,
              minOpacity: heatOptions?.minOpacity ?? 0.35,
              max: heatOptions?.max ?? 1.0,
            }}
          />
        )}

        {/* Markers (clustered) */}
        {showMarkers && (
          <>
            <Pane name="stations-pane" style={{ zIndex: 400 }} />
            <MarkerClusterGroup
              chunkedLoading
              showCoverageOnHover={false}
              spiderfyOnMaxZoom
              maxClusterRadius={42}
            >
              {stations.map((s, i) => (
                <Marker
                  key={`${s.id ?? i}`}
                  position={[s.lat, s.lon]}
                  icon={dotIcon}
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
                  <Popup>
                    <StationPanel
                      station={{
                        id: s.id,
                        name: s.name,
                        addr: s.addr,
                        postcode: s.postcode,
                        lat: s.lat,
                        lon: s.lon,
                        connectors: s.connectors,
                        reports: s.reports,
                        downtime: s.downtime,
                        source: s.source,
                      }}
                    />
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          </>
        )}

        {/* Locate / Reset controls (bottom-right) */}
        <LocateResetControls homeCenter={initialCenter} homeZoom={initialZoom} />
      </MapContainer>
    </div>
  );
}
