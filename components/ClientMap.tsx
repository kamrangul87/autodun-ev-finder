'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Pane,
  Polygon,
  CircleMarker,
  Popup,
} from 'react-leaflet';
import type { Map as LeafletMap, LatLngTuple } from 'leaflet';

import HeatmapWithScaling from '@/components/HeatmapWithScaling';
import SearchControl from '@/components/SearchControl';

// ---------- types ----------

type HeatOptions = {
  intensity?: number; // 0..1 scale to multiply each point's weight
  radius?: number;    // heatmap radius in px
  blur?: number;      // heatmap blur in px
};

export type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;
  showHeatmap?: boolean;
  showMarkers?: boolean;
  showCouncil?: boolean;
  heatOptions?: HeatOptions;
  onStationsCount?: (n: number) => void;
};

type Station = {
  id?: string | number;
  name?: string;
  address?: string;
  postcode?: string;
  source?: string;
  connectors?: number;
  lat: number;
  lng: number;
};

type CouncilGeoJSON = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties?: { name?: string };
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates:
        | number[][][]          // Polygon
        | number[][][][];       // MultiPolygon
    };
  }>;
};

// ---------- defaults ----------

const DEFAULT_CENTER: [number, number] = [51.5074, -0.1278]; // London
const DEFAULT_ZOOM = 12;
const DEFAULT_HEAT: Required<HeatOptions> = { intensity: 1, radius: 18, blur: 15 };

// ---------- helpers ----------

function normalizeStations(raw: any): Station[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((r: any): Station | null => {
        if (r && typeof r === 'object' && 'lat' in r && 'lng' in r) {
          return {
            id: r.id ?? undefined,
            name: r.name ?? undefined,
            address: r.address ?? undefined,
            postcode: r.postcode ?? undefined,
            source: r.source ?? undefined,
            connectors: Number.isFinite(r.connectors) ? Number(r.connectors) : undefined,
            lat: Number(r.lat),
            lng: Number(r.lng),
          };
        }
        if (Array.isArray(r) && (r.length === 2 || r.length === 3)) {
          const [lat, lng, connectors] = r;
          return {
            lat: Number(lat),
            lng: Number(lng),
            connectors: Number.isFinite(connectors) ? Number(connectors) : undefined,
          };
        }
        return null;
      })
      .filter(Boolean) as Station[];
  }
  return [];
}

function ringToLatLngs(ring: number[][]): LatLngTuple[] {
  // GeoJSON ring [lng,lat] -> Leaflet [lat,lng]
  return ring.map(([lng, lat]) => [lat, lng]);
}

// ---------- component ----------

export default function ClientMap({
  initialCenter,
  initialZoom,
  showHeatmap,
  showMarkers,
  showCouncil,
  heatOptions,
  onStationsCount,
}: Props = {}) {
  // Final options with defaults
  const center = initialCenter ?? DEFAULT_CENTER;
  const zoom = initialZoom ?? DEFAULT_ZOOM;
  const doHeatmap = showHeatmap ?? true;
  const doMarkers = showMarkers ?? true;
  const doCouncil = showCouncil ?? true;
  const heat = { ...DEFAULT_HEAT, ...(heatOptions ?? {}) };

  const mapRef = useRef<LeafletMap | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [council, setCouncil] = useState<CouncilGeoJSON | null>(null);

  // Safety: never render on the server
  if (typeof window === 'undefined') return null;

  // Load stations (JSON preferred; CSV fallback)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/data/ev_heat.json', { cache: 'no-store' });
        if (r.ok) {
          const json = await r.json();
          const norm = normalizeStations(json);
          if (!cancelled) setStations(norm);
          return;
        }
        const rcsv = await fetch('/data/ev_heat.csv', { cache: 'no-store' });
        if (rcsv.ok) {
          const text = await rcsv.text();
          const rows = text
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          const [header, ...data] = rows;
          const cols = header.split(',').map((s) => s.trim().toLowerCase());
          const latIdx = cols.indexOf('lat');
          const lngIdx = cols.indexOf('lng') >= 0 ? cols.indexOf('lng') : cols.indexOf('lon');
          const connIdx = cols.indexOf('connectors');

          const parsed: Station[] = data
            .map((line) => line.split(','))
            .map((arr) => {
              const lat = Number(arr[latIdx]);
              const lng = Number(arr[lngIdx]);
              const connectors =
                connIdx >= 0 && Number.isFinite(Number(arr[connIdx]))
                  ? Number(arr[connIdx])
                  : undefined;
              return Number.isFinite(lat) && Number.isFinite(lng)
                ? ({ lat, lng, connectors } as Station)
                : null;
            })
            .filter(Boolean) as Station[];

          if (!cancelled) setStations(parsed);
        }
      } catch {
        if (!cancelled) setStations([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load council polygons (optional)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/data/council-test.geojson?v=now', { cache: 'no-store' });
        if (r.ok) {
          const gj = (await r.json()) as CouncilGeoJSON;
          if (!cancelled) setCouncil(gj);
        } else {
          if (!cancelled) setCouncil(null);
        }
      } catch {
        if (!cancelled) setCouncil(null);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Report count up
  useEffect(() => {
    if (onStationsCount) onStationsCount(stations.length);
  }, [stations.length, onStationsCount]);

  // Heatmap points = lat/lng + value (connectors * intensity; ≥ 0.5)
  const heatPoints = useMemo(
    () =>
      stations.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        value: Math.max(0.5, (s.connectors ?? 1) * Math.max(0, heat.intensity)),
      })),
    [stations, heat.intensity]
  );

  return (
    <div className="relative">
      <MapContainer
        ref={mapRef as any}
        center={center}
        zoom={zoom}
        className="leaflet-map"
        preferCanvas
        style={{ height: 'calc(100vh - 120px)' }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Search bar */}
        <SearchControl />

        {/* Heatmap */}
        {doHeatmap && heatPoints.length > 0 && (
          <Pane name="heatmap" style={{ zIndex: 350 }}>
            <HeatmapWithScaling
              points={heatPoints}
              radius={Math.max(1, Math.round(heat.radius))}
              blur={Math.max(0, Math.round(heat.blur))}
            />
          </Pane>
        )}

        {/* Markers */}
        {doMarkers && stations.length > 0 && (
          <Pane name="markers" style={{ zIndex: 400 }}>
            {stations.map((s, i) => (
              <CircleMarker
                key={s.id ?? i}
                center={[s.lat, s.lng]}
                radius={4}
                weight={1}
                pathOptions={{ color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.8 }}
              >
                <Popup>
                  <div style={{ minWidth: 220 }}>
                    <strong>{s.name ?? 'EV Charging'}</strong>
                    <div>{s.address ?? '—'}</div>
                    <div>{s.postcode ?? '—'}</div>
                    <div>Source: {s.source ?? 'osm'}</div>
                    <div>Connectors: {s.connectors ?? 1}</div>
                    <div>
                      Coordinates: {s.lat.toFixed(6)}, {s.lng.toFixed(6)}
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Google Maps
                    </a>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </Pane>
        )}

        {/* Council polygons */}
        {doCouncil && council && council.features?.length > 0 && (
          <Pane name="council" style={{ zIndex: 300 }}>
            {council.features.map((f, idx) => {
              const g = f.geometry;
              const name = f.properties?.name ?? `Area ${idx + 1}`;

              if (g.type === 'Polygon') {
                const rings = g.coordinates as number[][][];
                return (
                  <Polygon
                    key={`poly-${idx}`}
                    positions={rings.map(ringToLatLngs)}
                    pathOptions={{ color: '#0284c7', weight: 2, fillOpacity: 0.12 }}
                  >
                    <Popup>{name}</Popup>
                  </Polygon>
                );
              }

              if (g.type === 'MultiPolygon') {
                const polys = g.coordinates as number[][][][];
                return polys.map((poly, i2) => (
                  <Polygon
                    key={`mpoly-${idx}-${i2}`}
                    positions={poly.map(ringToLatLngs)}
                    pathOptions={{ color: '#0284c7', weight: 2, fillOpacity: 0.12 }}
                  >
                    <Popup>{name}</Popup>
                  </Polygon>
                ));
              }

              return null;
            })}
          </Pane>
        )}
      </MapContainer>
    </div>
  );
}
