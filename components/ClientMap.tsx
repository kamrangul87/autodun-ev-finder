'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Pane,
  CircleMarker,
  Popup,
  GeoJSON,
  Tooltip,
  useMap,
} from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';

import SearchControl from '@/components/SearchControl';
import HeatmapWithScaling from '@/components/HeatmapWithScaling';

// ---- Types -----------------------------------------------------------------

type Props = {
  initialCenter: [number, number];
  initialZoom: number;
  showHeatmap: boolean;
  showMarkers: boolean;
  showCouncil: boolean;
  heatOptions: { intensity: number; radius: number; blur: number };
  onStationsCount?: (n: number) => void;
};

type Station = {
  id?: string | number;
  name?: string;
  address?: string;
  postcode?: string;
  lat: number;     // NOTE: expect lat/lon keys from /public/data/ev_heat.json
  lon: number;
  source?: string;
  connectors?: number;
  reports?: number;
  downtime_mins?: number;
};

type CouncilFC = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  { name?: string }
>;

// HeatmapWithScaling expects points as {lat, lng, value}
type HeatPoint = { lat: number; lng: number; value: number };

// ---- Helpers ----------------------------------------------------------------

function MapInit({ onReady }: { onReady: (m: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

// ---- Component --------------------------------------------------------------

export default function ClientMap({
  initialCenter,
  initialZoom,
  showHeatmap,
  showMarkers,
  showCouncil,
  heatOptions,
  onStationsCount,
}: Props) {
  const mapRef = useRef<LeafletMap | null>(null);

  const [stations, setStations] = useState<Station[]>([]);
  const [council, setCouncil] = useState<CouncilFC | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  // Fetch stations (from public/data/* so it works on Vercel static hosting)
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setDataError(null);
        // Prefer JSON; if you only have CSV, adapt parsing here.
        const r = await fetch('/data/ev_heat.json', { cache: 'no-store' });
        if (!r.ok) throw new Error(`stations ${r.status}`);
        const raw = await r.json();

        // Accept both array-of-objects or {stations:[...]}
        const arr: any[] = Array.isArray(raw) ? raw : raw?.stations ?? [];
        const parsed: Station[] = arr
          .map((s) => ({
            id: s.id ?? s._id ?? undefined,
            name: s.name ?? s.Name ?? 'EV Charging',
            address: s.address ?? s.Address ?? '',
            postcode: s.postcode ?? s.Postcode ?? '',
            lat: Number(s.lat ?? s.latitude),
            lon: Number(s.lon ?? s.lng ?? s.longitude),
            source: s.source ?? s.Source ?? 'osm',
            connectors: Number(s.connectors ?? s.Connectors ?? 0),
            reports: Number(s.reports ?? s.Reports ?? 0),
            downtime_mins: Number(s.downtime_mins ?? s.Downtime ?? 0),
          }))
          .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));

        if (!cancelled) {
          setStations(parsed);
          onStationsCount?.(parsed.length);
        }
      } catch (err: any) {
        if (!cancelled) {
          setDataError(err?.message || 'Failed to fetch stations');
          setStations([]);
          onStationsCount?.(0);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [onStationsCount]);

  // Fetch council test polygons
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/data/council-test.geojson?v=now', {
          cache: 'no-store',
        });
        if (!r.ok) throw new Error(`council ${r.status}`);
        const gj = (await r.json()) as CouncilFC;
        if (!cancelled) setCouncil(gj);
      } catch {
        if (!cancelled) setCouncil(null);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Heatmap points
  const heatPoints: HeatPoint[] = useMemo(
    () =>
      stations.map((s) => ({
        lat: s.lat,
        lng: s.lon,
        value: Math.max(1, Number(s.connectors ?? 1)),
      })),
    [stations]
  );

  // Simple marker color by connectors to give users a hint
  const markerColor = (n?: number) => {
    const c = Number(n ?? 0);
    if (c >= 6) return '#1976d2';
    if (c >= 3) return '#2e7d32';
    return '#d32f2f';
  };

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="relative">
      {/* Optional soft error (doesn't crash UI) */}
      {dataError && (
        <div className="absolute z-[9999] left-1/2 -translate-x-1/2 top-2 px-3 py-1 rounded bg-red-600 text-white text-sm shadow">
          Data load error: {dataError}
        </div>
      )}

      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        preferCanvas
        className="leaflet-map"
        style={{ height: 'calc(100vh - 140px)' }}
      >
        {/* Provide Leaflet map instance safely without using deprecated whenCreated */}
        <MapInit onReady={(m) => (mapRef.current = m)} />

        {/* Base map – keep default panes to avoid “pane already exists” */}
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Search bar control (already fixed cleanup in your repo) */}
        <SearchControl mapRef={mapRef} />

        {/* Heatmap */}
        {showHeatmap && heatPoints.length > 0 && (
          <Pane name="heatmap" style={{ zIndex: 350 }}>
            <HeatmapWithScaling
              points={heatPoints}
              intensity={heatOptions.intensity}
              radius={heatOptions.radius}
              blur={heatOptions.blur}
            />
          </Pane>
        )}

        {/* Station markers */}
        {showMarkers && stations.length > 0 && (
          <Pane name="markers" style={{ zIndex: 450 }}>
            {stations.map((s, i) => (
              <CircleMarker
                key={s.id ?? i}
                center={[s.lat, s.lon]}
                radius={6}
                pathOptions={{
                  color: markerColor(s.connectors),
                  weight: 1.5,
                  fillOpacity: 0.85,
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.9}>
                  {s.name || 'EV Charging'}
                </Tooltip>
                <Popup>
                  <div className="space-y-1 text-sm">
                    <div className="font-semibold">
                      {s.name || 'EV Charging'}
                    </div>
                    <div>{s.address || '-'}</div>
                    <div>{s.postcode || '-'}</div>
                    <div className="text-xs opacity-70">
                      Source: {s.source || '-'}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs pt-1">
                      <span>Connectors</span>
                      <span>{Number(s.connectors ?? 0)}</span>
                      <span>Reports</span>
                      <span>{Number(s.reports ?? 0)}</span>
                      <span>Downtime (mins)</span>
                      <span>{Number(s.downtime_mins ?? 0)}</span>
                    </div>
                    <a
                      className="inline-block mt-2 text-blue-600 underline"
                      target="_blank"
                      rel="noreferrer"
                      href={`https://www.google.com/maps?q=${s.lat},${s.lon}`}
                    >
                      Open in Google Maps
                    </a>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </Pane>
        )}

        {/* Council polygons (test data) */}
        {showCouncil && council && (
          <Pane name="council" style={{ zIndex: 300 }}>
            <GeoJSON
              data={council as any}
              style={() => ({
                color: '#14827a',
                weight: 2,
                fillColor: '#14827a',
                fillOpacity: 0.15,
              })}
              onEachFeature={(feature, layer) => {
                const nm =
                  (feature?.properties as any)?.name ??
                  (feature?.properties as any)?.NAME ??
                  'Council';
                layer.bindPopup(`<strong>${nm}</strong>`);
              }}
            />
          </Pane>
        )}
      </MapContainer>
    </div>
  );
}
