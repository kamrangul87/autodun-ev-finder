'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import {
  MapContainer,
  TileLayer,
  Polygon,
  CircleMarker,
  Popup,
} from 'react-leaflet';
import type { Map as LeafletMap, LatLngTuple } from 'leaflet';

import HeatmapWithScaling from '@/components/HeatmapWithScaling';
import SearchControl from '@/components/SearchControl';
import Controls from '@/components/ev/Controls';

export type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;
  showHeatmap?: boolean;
  showMarkers?: boolean;
  showCouncil?: boolean;
  heatOptions?: { intensity?: number; radius?: number; blur?: number };
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
      coordinates: number[][][] | number[][][][];
    };
  }>;
};

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
            connectors: Number.isFinite(r.connectors)
              ? Number(r.connectors)
              : undefined,
            lat: Number(r.lat),
            lng: Number(r.lng),
          };
        }
        if (Array.isArray(r) && (r.length === 2 || r.length === 3)) {
          const [lat, lng, connectors] = r;
          return {
            lat: Number(lat),
            lng: Number(lng),
            connectors: Number.isFinite(connectors)
              ? Number(connectors)
              : undefined,
          };
        }
        return null;
      })
      .filter(Boolean) as Station[];
  }
  return [];
}

function ringToLatLngs(ring: number[][]): LatLngTuple[] {
  return ring.map(([lng, lat]) => [lat, lng]);
}

export default function ClientMapInner(props: Props) {
  const center = props.initialCenter ?? [51.5074, -0.1278];
  const zoom = props.initialZoom ?? 12;

  // Layer toggles
  const [showHeatmap, setShowHeatmap] = useState<boolean>(props.showHeatmap ?? true);
  const [showMarkers, setShowMarkers] = useState<boolean>(props.showMarkers ?? true);
  const [showCouncil, setShowCouncil] = useState<boolean>(props.showCouncil ?? true);

  // Heatmap controls (✅ now includes blur)
  const [heatIntensity, setHeatIntensity] = useState<number>(props.heatOptions?.intensity ?? 1);
  const [heatRadius, setHeatRadius] = useState<number>(props.heatOptions?.radius ?? 18);
  const [heatBlur, setHeatBlur] = useState<number>(props.heatOptions?.blur ?? 15);

  const heatOptions = {
    intensity: heatIntensity,
    radius: heatRadius,
    blur: heatBlur,
  };

  const mapRef = useRef<LeafletMap | null>(null);

  // Data
  const [stations, setStations] = useState<Station[]>([]);
  const [council, setCouncil] = useState<CouncilGeoJSON | null>(null);

  // UI
  const [controlsOpen, setControlsOpen] = useState<boolean>(false);
  const [feedbackOpen, setFeedbackOpen] = useState<boolean>(false);
  const [feedbackText, setFeedbackText] = useState<string>('');

  // Load stations (json -> csv -> fallback)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let loaded = false;

        const r = await fetch('/data/ev_heat.json', { cache: 'no-store' });
        if (r.ok) {
          try {
            const json = await r.json();
            const norm = normalizeStations(json);
            if (!cancelled) {
              setStations(norm);
              loaded = norm.length > 0;
            }
          } catch (e) {
            console.warn('[ev] ev_heat.json parse failed:', e);
          }
        }

        if (!loaded) {
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

            if (!cancelled) {
              setStations(parsed);
              loaded = parsed.length > 0;
            }
          }

          if (!r.ok && !rcsv.ok && !cancelled) {
            console.warn('[ev] No ev_heat.{json,csv}; rendering base map only');
          }
        }

        if (!loaded && !cancelled) {
          const sample: Station[] = [
            { lat: 51.5079, lng: -0.1283, connectors: 2 },
            { lat: 51.509, lng: -0.1357, connectors: 1 },
            { lat: 51.5033, lng: -0.1196, connectors: 3 },
            { lat: 51.512, lng: -0.1042, connectors: 2 },
            { lat: 51.5007, lng: -0.1246, connectors: 2 },
            { lat: 51.5155, lng: -0.141, connectors: 1 },
            { lat: 51.52, lng: -0.13, connectors: 2 },
            { lat: 51.5065, lng: -0.142, connectors: 1 },
          ];
          setStations(sample);
        }
      } catch {
        if (!cancelled) setStations([]);
        console.warn('[ev] Failed loading stations; base map only');
      }
    };

    if (typeof window !== 'undefined') load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load council polygons
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/data/council-test.geojson', { cache: 'no-store' });
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
    if (typeof window !== 'undefined') load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Report station count to parent (if requested)
  useEffect(() => {
    if (typeof props.onStationsCount === 'function') {
      props.onStationsCount(stations.length);
    }
  }, [stations.length, props]);

  // Heatmap points
  const heatPoints = useMemo(
    () =>
      stations.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        value: Math.max(0.5, (s.connectors ?? 1) * Math.max(0, heatOptions.intensity || 1)),
      })),
    [stations, heatOptions.intensity]
  );

  return (
    <div className="relative">
      {/* Top-right buttons */}
      <div className="absolute right-3 top-3 z-[1000] flex gap-2">
        <button
          type="button"
          onClick={() => setControlsOpen((v) => !v)}
          className="px-3 py-1 rounded bg-white/90 shadow text-sm border border-gray-200 hover:bg-white"
        >
          Controls
        </button>
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="px-3 py-1 rounded bg-white/90 shadow text-sm border border-gray-200 hover:bg-white"
        >
          Feedback
        </button>
      </div>

      {/* Controls Drawer */}
      {controlsOpen && (
        <div className="absolute right-3 top-12 z-[1000]">
          <Controls
            showHeatmap={showHeatmap}
            setShowHeatmap={setShowHeatmap}
            showMarkers={showMarkers}
            setShowMarkers={setShowMarkers}
            showPolygons={showCouncil}
            setShowPolygons={setShowCouncil}
            intensity={heatIntensity}
            setIntensity={setHeatIntensity}
            radius={heatRadius}
            setRadius={setHeatRadius}
            blur={heatBlur}
            setBlur={setHeatBlur}
          />
        </div>
      )}

      {/* Feedback Modal */}
      {feedbackOpen && (
        <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-black/40">
          <div className="w-[90%] max-w-md rounded-lg bg-white shadow border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">Send Feedback</div>
              <button
                type="button"
                className="text-sm"
                onClick={() => setFeedbackOpen(false)}
              >
                ✕
              </button>
            </div>
            <textarea
              className="w-full h-32 p-2 border border-gray-300 rounded"
              placeholder="Share your feedback..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1 rounded border border-gray-300 text-sm"
                onClick={() => setFeedbackOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    const subject = 'EV Finder Feedback';
                    const body = encodeURIComponent(feedbackText || '');
                    window.location.href = `mailto:autodun.feedback@example.com?subject=${encodeURIComponent(
                      subject
                    )}&body=${body}`;
                  }
                  setFeedbackOpen(false);
                  setFeedbackText('');
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      {typeof window !== 'undefined' && (
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

          <SearchControl />

          {/* Heatmap */}
          {showHeatmap && heatPoints.length > 0 && (
            <HeatmapWithScaling
              points={heatPoints}
              radius={Math.max(1, Math.round(heatOptions.radius))}
              blur={Math.max(0, Math.round(heatOptions.blur))}
            />
          )}

          {/* Markers */}
          {showMarkers && stations.length > 0 && (
            <>
              {stations.map((s, i) => (
                <CircleMarker
                  key={s.id ?? i}
                  center={[s.lat, s.lng]}
                  radius={4}
                  weight={1}
                  pathOptions={{
                    color: '#2563eb',
                    fillColor: '#60a5fa',
                    fillOpacity: 0.8,
                  }}
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
            </>
          )}

          {/* Council polygons */}
          {showCouncil && council && council.features?.length > 0 && (
            <>
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
            </>
          )}
        </MapContainer>
      )}
    </div>
  );
}
