'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { featuresFor, scoreFor, type OCMStation } from '../../lib/model1';

// React-Leaflet components (client only)
const MapContainer = dynamic(
  () => import('react-leaflet').then(m => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then(m => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then(m => m.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then(m => m.Popup),
  { ssr: false }
);

type HeatPoint = [number, number, number];

interface StationWithScore extends OCMStation {
  _score: number;
  DataSource?: string;
}

function isStationWithScore(x: any): x is StationWithScore {
  return !!x && typeof x === 'object' && typeof x._score === 'number';
}

function isMapAlive(m: any) {
  return !!(m && typeof m._leaflet_id !== 'undefined');
}

/** Tiny error boundary so a misbehaving child can’t blank the page */
class Boundary extends React.Component<{ children: React.ReactNode }, { err?: any }> {
  state = { err: undefined as any };
  static getDerivedStateFromError(err: any) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ color: '#fff', background: '#111827', padding: 16, borderRadius: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Map component crashed</div>
          <code style={{ fontSize: 12 }}>{String(this.state.err?.message || this.state.err)}</code>
        </div>
      );
    }
    return this.props.children as any;
  }
}

/** Attaches/removes a Leaflet.heat layer when `map` and `points` are ready */
function useHeatLayer(map: any, points: HeatPoint[], enabled: boolean) {
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!enabled || !isMapAlive(map)) return;

      const L = (await import('leaflet')).default as any;
      await import('leaflet.heat'); // side-effect plugin

      // remove previous
      if (layerRef.current && isMapAlive(map)) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
      if (cancelled || points.length === 0) return;

      const layer = (L as any).heatLayer(points, {
        radius: 45,
        blur: 25,
        maxZoom: 17,
        max: 1.0,
        minOpacity: 0.35,
      });
      layer.addTo(map);
      layerRef.current = layer;
    })();

    return () => {
      cancelled = true;
      if (layerRef.current && isMapAlive(map)) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
    };
  }, [map, enabled, points]);
}

export default function Model1HeatmapPage() {
  // default: London
  const [params] = useState(() => {
    if (typeof window === 'undefined') return { lat: 51.5074, lon: -0.1278, dist: 25 };
    const sp = new URLSearchParams(window.location.search);
    const lat = Number(sp.get('lat') || 51.5074);
    const lon = Number(sp.get('lon') || -0.1278);
    const dist = Number(sp.get('dist') || 25);
    return {
      lat: Number.isFinite(lat) ? lat : 51.5074,
      lon: Number.isFinite(lon) ? lon : -0.1278,
      dist: Number.isFinite(dist) ? dist : 25,
    };
  });

  const [map, setMap] = useState<any>(null);
  const [bounds, setBounds] =
    useState<{ north: number; south: number; east: number; west: number } | null>(null);

  const [stations, setStations] = useState<StationWithScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showHeatmap, setShowHeatmap] = useState(false);
  const [query, setQuery] = useState('');

  // icons
  const [operationalIcon, offlineIcon] = useMemo(() => {
    if (typeof window === 'undefined') return [undefined, undefined];
    const L = require('leaflet');
    const ok = L.divIcon({
      html: '<div style="width:14px;height:14px;background:#3b82f6;border-radius:50%;border:2px solid #fff;"></div>',
      iconSize: [18, 18],
      className: '',
    });
    const off = L.divIcon({
      html: '<div style="width:14px;height:14px;background:#ef4444;border-radius:50%;border:2px solid #fff;"></div>',
      iconSize: [18, 18],
      className: '',
    });
    return [ok, off];
  }, []);

  // fetch OCM sites within bbox (or fallback to center/radius on first load)
  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '';

    async function run() {
      setLoading(true);
      setError(null);
      try {
        let url = '';
        if (bounds) {
          const { north, south, east, west } = bounds;
          url = `${apiBase}/api/sites?bbox=${west},${south},${east},${north}&source=ocm`;
        } else {
          url = `${apiBase}/api/stations?lat=${params.lat}&lon=${params.lon}&dist=${params.dist}&source=ocm`;
        }
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error(`API ${r.status}`);
        const data = await r.json();
        const arr: any[] = Array.isArray(data) ? data : Array.isArray(data?.sites) ? data.sites : [];

        const scored = arr
          .map((s: any): StationWithScore | null => {
            // tolerate both /stations and /sites shapes
            const lat = s?.AddressInfo?.Latitude ?? s?.lat;
            const lon = s?.AddressInfo?.Longitude ?? s?.lon;
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

            if (!s.AddressInfo) {
              s.AddressInfo = {
                Latitude: lat,
                Longitude: lon,
                Postcode: s.postcode ?? null,
                Title: s.name ?? 'EV charge point',
              };
            }
            s.DataSource = s.source ?? 'ocm';

            const f = featuresFor(s as OCMStation);
            const sc = scoreFor(f);
            return Object.assign({}, s, { _score: sc }) as StationWithScore;
          })
          .filter(isStationWithScore);

        setStations(scored);
      } catch (e: any) {
        console.error(e);
        setError(e?.message || 'Failed to load stations');
        setStations([]);
      } finally {
        setLoading(false);
      }
    }

    run();
  }, [bounds, params.lat, params.lon, params.dist]);

  // compute heat points
  const heatPoints: HeatPoint[] = useMemo(() => {
    if (!stations.length) return [];
    const vals = stations.map((s) => s._score);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    return stations
      .map((s) => {
        const lat = (s as any).AddressInfo?.Latitude ?? (s as any).lat;
        const lon = (s as any).AddressInfo?.Longitude ?? (s as any).lon;
        const w = (s._score - min) / span;
        return [lat as number, lon as number, w] as HeatPoint;
      })
      .filter(p => p.every(n => Number.isFinite(n)));
  }, [stations]);

  // attach heat layer (only when map exists)
  useHeatLayer(map, heatPoints, showHeatmap);

  // keep bounds in sync with map — attach once; detach only if map is still alive
  useEffect(() => {
    if (!isMapAlive(map)) return;

    let cancelled = false;
    const update = () => {
      if (cancelled || !isMapAlive(map)) return;
      const b = map.getBounds?.();
      if (!b) return;
      setBounds({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    };

    // initial + listeners
    try {
      update();
      map.on('moveend', update);
      map.on('zoomend', update);
    } catch {}

    return () => {
      cancelled = true;
      try {
        if (isMapAlive(map)) {
          map.off('moveend', update);
          map.off('zoomend', update);
        }
      } catch {}
    };
  }, [map]);

  // search (postcode/area)
  async function doSearch() {
    const q = query.trim();
    if (!q) return;
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '';
      const r = await fetch(`${apiBase}/api/geocode?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const g = await r.json();
      if (!r.ok) throw new Error(g?.error || 'Search failed');
      const lat = Number(g.lat), lon = Number(g.lon);
      if (isMapAlive(map) && Number.isFinite(lat) && Number.isFinite(lon)) map.setView([lat, lon], 14);
    } catch (e) {
      console.error(e);
    }
  }

  const mapCenter: [number, number] = [params.lat, params.lon];

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      {/* Controls */}
      <div
        style={{
          position: 'absolute', top: '0.75rem', left: '0.75rem', zIndex: 1000,
          background: 'rgba(12,19,38,0.92)', padding: '0.75rem', borderRadius: 8,
          color: '#f9fafb', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition((pos) => {
              const { latitude, longitude } = pos.coords;
              if (isMapAlive(map)) map.setView([latitude, longitude], 13);
            });
          }}
          style={{ padding: '0.35rem 0.6rem', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, color: '#fff' }}
        >
          Use my location
        </button>
        <button
          onClick={() => isMapAlive(map) && map.setView(mapCenter, 12)}
          style={{ padding: '0.35rem 0.6rem', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, color: '#fff' }}
        >
          Reset view
        </button>
        <button
          onClick={() => setShowHeatmap(v => !v)}
          style={{ padding: '0.35rem 0.6rem', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, color: '#fff' }}
        >
          {showHeatmap ? 'Hide heatmap' : 'Heatmap'}
        </button>

        {/* Search */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="Search postcode or area (e.g. EC1A, Westminster)"
            style={{
              width: 320, padding: '0.4rem 0.5rem', background: '#0b1220',
              border: '1px solid #374151', borderRadius: 6, color: '#f9fafb', fontSize: 13,
            }}
          />
          <button
            onClick={doSearch}
            style={{ padding: '0.35rem 0.6rem', background: '#1f2937', border: '1px solid #374151', borderRadius: 6, color: '#fff' }}
          >
            Search
          </button>
        </div>
      </div>

      {/* Map */}
      <Boundary>
        <main style={{ height: '100%', width: '100%' }}>
          <MapContainer
            center={mapCenter}
            zoom={12}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
            ref={setMap} // ref callback: gives us the real map instance
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Markers are always visible; heat overlay is layered on top */}
            {stations.map((s, i) => {
              const lat = (s as any).AddressInfo?.Latitude ?? (s as any).lat;
              const lon = (s as any).AddressInfo?.Longitude ?? (s as any).lon;
              if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

              const title =
                (s as any).AddressInfo?.Title ?? (s as any).name ?? 'EV charge point';
              const postcode =
                (s as any).AddressInfo?.Postcode ?? (s as any).postcode ?? '';

              const maxPowerKw = Array.isArray((s as any).Connections)
                ? Math.max(0, ...((s as any).Connections.map((c: any) => Number(c?.PowerKW ?? 0)) as number[]))
                : (s as any).maxPowerKw ?? null;

              const isOperational =
                typeof (s as any).StatusType?.IsOperational === 'boolean'
                  ? (s as any).StatusType.IsOperational
                  : null;

              return (
                <Marker
                  key={i}
                  position={[lat as number, lon as number]}
                  icon={
                    isOperational === null
                      ? undefined
                      : isOperational
                      ? operationalIcon
                      : offlineIcon
                  }
                >
                  <Popup>
                    <strong>{title}</strong>
                    <br />
                    Postcode: {postcode || '—'}
                    <br />
                    Connectors:{' '}
                    {Array.isArray((s as any).Connections)
                      ? (s as any).Connections.length
                      : (s as any).connectors ?? '—'}
                    <br />
                    Max power: {maxPowerKw != null ? `${maxPowerKw} kW` : '—'}
                    <br />
                    Score: {s._score.toFixed(2)}
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* Empty state */}
          {!loading && !error && stations.length === 0 && (
            <div
              style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                padding: '1rem', background: 'rgba(0,0,0,0.7)', borderRadius: 8,
                color: '#f9fafb', fontSize: 14, zIndex: 1000, textAlign: 'center', maxWidth: '80%',
              }}
            >
              No stations in view. Try zooming out or moving the map.
            </div>
          )}
        </main>
      </Boundary>
    </div>
  );
}
