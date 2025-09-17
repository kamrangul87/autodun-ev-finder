'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { useMap, useMapEvents } from 'react-leaflet';
import { featuresFor, scoreFor, type OCMStation } from '../../lib/model1';

// Client-only React-Leaflet components
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer     = dynamic(() => import('react-leaflet').then(m => m.TileLayer),     { ssr: false });
const Marker        = dynamic(() => import('react-leaflet').then(m => m.Marker),        { ssr: false });
const Popup         = dynamic(() => import('react-leaflet').then(m => m.Popup),         { ssr: false });

type HeatPoint = [number, number, number];
interface StationWithScore extends OCMStation { _score: number; DataSource?: string; }
const isS = (x: any): x is StationWithScore => !!x && typeof x._score === 'number';

/** Syncs outer state with map bounds (no manual on/off). */
function BoundsWatcher({ onChange }: { onChange: (b: { north: number; south: number; east: number; west: number }) => void }) {
  const map = useMap();
  const push = React.useCallback(() => {
    const b = map.getBounds();
    onChange({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
  }, [map, onChange]);

  useEffect(() => { push(); }, [push]);
  useMapEvents({ moveend: push, zoomend: push });
  return null;
}

/** Heat overlay mounted safely within the map lifecycle. */
function HeatOverlay({ points, enabled }: { points: HeatPoint[]; enabled: boolean }) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Remove any previous layer
      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
      if (!enabled || points.length === 0) return;

      const L = (await import('leaflet')).default as any;
      await import('leaflet.heat'); // adds L.heatLayer
      if (cancelled) return;

      const layer = (L as any).heatLayer(points, {
        radius: 45, blur: 25, maxZoom: 17, max: 1.0, minOpacity: 0.35,
      });
      layer.addTo(map);
      layerRef.current = layer;
    })();

    return () => {
      cancelled = true;
      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
    };
  }, [map, points, enabled]);

  return null;
}

/** Expose map instance to a ref (for search recenter). */
function MapHandle({ mapRef }: { mapRef: React.MutableRefObject<any> }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; return () => { mapRef.current = null; }; }, [map, mapRef]);
  return null;
}

export default function Model1HeatmapPage() {
  // Prevent hydration race: render map only after client mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Default: London
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

  const [bounds, setBounds] =
    useState<{ north: number; south: number; east: number; west: number } | null>(null);

  const [stations, setStations] = useState<StationWithScore[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [showHeatmap, setShowHeatmap] = useState(false);
  const [query, setQuery] = useState('');
  const mapRef = useRef<any>(null);

  // Nice div icons for markers
  const [okIcon, offIcon] = useMemo(() => {
    if (typeof window === 'undefined') return [undefined, undefined];
    const L = require('leaflet');
    const ok  = L.divIcon({ html:'<div style="width:14px;height:14px;background:#3b82f6;border-radius:50%;border:2px solid #fff;"></div>', iconSize:[18,18], className:'' });
    const off = L.divIcon({ html:'<div style="width:14px;height:14px;background:#ef4444;border-radius:50%;border:2px solid #fff;"></div>', iconSize:[18,18], className:'' });
    return [ok, off];
  }, []);

  // Fetch stations (bbox if known else center/radius)
  useEffect(() => {
    if (!mounted) return;
    const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '';

    (async () => {
      setLoading(true); setError(null);
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
            const lat = s?.AddressInfo?.Latitude ?? s?.lat;
            const lon = s?.AddressInfo?.Longitude ?? s?.lon;
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

            if (!s.AddressInfo) {
              s.AddressInfo = {
                Latitude: lat, Longitude: lon,
                Title: s.name ?? 'EV charge point',
                Postcode: s.postcode ?? null,
              };
            }
            s.DataSource = s.source ?? 'ocm';

            const f = featuresFor(s as OCMStation);
            const sc = scoreFor(f);
            return Object.assign({}, s, { _score: sc }) as StationWithScore;
          })
          .filter(isS);

        setStations(scored);
      } catch (e: any) {
        console.error(e);
        setError(e?.message || 'Failed to load stations');
        setStations([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [mounted, bounds, params.lat, params.lon, params.dist]);

  // Heat points
  const heatPoints: HeatPoint[] = useMemo(() => {
    if (!stations.length) return [];
    const vals = stations.map(s => s._score);
    const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    return stations.map(s => {
      const lat = (s as any).AddressInfo?.Latitude ?? (s as any).lat;
      const lon = (s as any).AddressInfo?.Longitude ?? (s as any).lon;
      return [lat as number, lon as number, (s._score - min) / span] as HeatPoint;
    });
  }, [stations]);

  async function doSearch() {
    const q = query.trim();
    if (!q) return;
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '';
      const r = await fetch(`${apiBase}/api/geocode?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const g = await r.json();
      if (!r.ok) throw new Error(g?.error || 'Search failed');
      const lat = Number(g.lat), lon = Number(g.lon);
      if (mapRef.current && Number.isFinite(lat) && Number.isFinite(lon)) {
        mapRef.current.setView([lat, lon], 14);
      }
    } catch (e) {
      console.error(e);
    }
  }

  const center: [number, number] = [params.lat, params.lon];

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      {/* Controls */}
      <div style={{
        position:'absolute', top:'0.75rem', left:'0.75rem', zIndex:1000,
        background:'rgba(12,19,38,0.92)', padding:'0.75rem', borderRadius:8,
        color:'#f9fafb', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'
      }}>
        <button
          onClick={() => navigator.geolocation?.getCurrentPosition(pos => {
            mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 13);
          })}
          style={{ padding:'0.35rem 0.6rem', background:'#1f2937', border:'1px solid #374151', borderRadius:6, color:'#fff' }}>
          Use my location
        </button>
        <button
          onClick={() => mapRef.current?.setView(center, 12)}
          style={{ padding:'0.35rem 0.6rem', background:'#1f2937', border:'1px solid #374151', borderRadius:6, color:'#fff' }}>
          Reset view
        </button>
        <button
          onClick={() => setShowHeatmap(v => !v)}
          style={{ padding:'0.35rem 0.6rem', background:'#1f2937', border:'1px solid #374151', borderRadius:6, color:'#fff' }}>
          {showHeatmap ? 'Hide heatmap' : 'Heatmap'}
        </button>

        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="Search postcode or area (e.g. EC1A, Westminster)"
          style={{
            width: 320, padding:'0.4rem 0.5rem', background:'#0b1220',
            border:'1px solid #374151', borderRadius:6, color:'#f9fafb', fontSize:13
          }}
        />
        <button
          onClick={doSearch}
          style={{ padding:'0.35rem 0.6rem', background:'#1f2937', border:'1px solid #374151', borderRadius:6, color:'#fff' }}>
          Search
        </button>
      </div>

      {/* Map only after client mounted */}
      {mounted && (
        <main style={{ height:'100%', width:'100%' }}>
          <MapContainer center={center} zoom={12} scrollWheelZoom style={{ height:'100%', width:'100%' }}>
            <MapHandle mapRef={mapRef} />
            <BoundsWatcher onChange={setBounds} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Heat overlay toggles ON, markers always rendered */}
            <HeatOverlay points={heatPoints} enabled={showHeatmap} />

            {stations.map((s, i) => {
              const lat = (s as any).AddressInfo?.Latitude ?? (s as any).lat;
              const lon = (s as any).AddressInfo?.Longitude ?? (s as any).lon;
              if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

              const title = (s as any).AddressInfo?.Title ?? (s as any).name ?? 'EV charge point';
              const postcode = (s as any).AddressInfo?.Postcode ?? (s as any).postcode ?? '';

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
                  icon={isOperational === null ? undefined : isOperational ? okIcon : offIcon}
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

          {!loading && !error && stations.length === 0 && (
            <div style={{
              position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)',
              padding:'1rem', background:'rgba(0,0,0,0.7)', borderRadius:8, color:'#f9fafb',
              fontSize:14, zIndex:1000, textAlign:'center', maxWidth:'80%',
            }}>
              No stations in view. Try zooming out or moving the map.
            </div>
          )}
        </main>
      )}
    </div>
  );
}
