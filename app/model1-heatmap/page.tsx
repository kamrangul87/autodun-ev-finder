// app/model1-heatmap/page.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useMap } from 'react-leaflet';
import type * as L from 'leaflet'; // type-only (no runtime import)

// Load react-leaflet components dynamically (avoids SSR issues)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer     = dynamic(() => import('react-leaflet').then(m => m.TileLayer),     { ssr: false });
const CircleMarker  = dynamic(() => import('react-leaflet').then(m => m.CircleMarker),  { ssr: false });
const Popup         = dynamic(() => import('react-leaflet').then(m => m.Popup),         { ssr: false });

// ---- Types (no runtime import) ----
type LatLngLike = { lat: number; lng: number };
type OcmPoi = any;
type Station = {
  lat: number; lon: number; name?: string | null;
  addr?: string | null; postcode?: string | null;
  connectors?: number; maxPowerKw?: number; score?: number;
  raw: OcmPoi;
};

/** Distance (km) from bounds as half of diagonal using haversine */
function kmFromBounds(bounds: any): number {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(ne.lat - sw.lat);
  const dLon = toRad(ne.lng - sw.lng);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(sw.lat)) * Math.cos(toRad(ne.lat)) *
            Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c) / 2;
}

function normalise(p: OcmPoi): Station | null {
  const lat = p?.AddressInfo?.Latitude;
  const lon = p?.AddressInfo?.Longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  const conns: any[] = Array.isArray(p?.Connections) ? p.Connections : [];
  const connectors = conns.length;
  const maxPowerKw = conns.reduce((m, c) => (typeof c?.PowerKW === 'number' && c.PowerKW > m ? c.PowerKW : m), 0) || 0;

  const s = p?.autodun?.score as number | undefined;
  const score =
    typeof s === 'number'
      ? s
      : (0.6 * Math.log(1 + (connectors || 0)) + 0.3 * (maxPowerKw / 350) + 0.1);

  return {
    lat, lon,
    name: p?.AddressInfo?.Title ?? null,
    addr: p?.AddressInfo?.AddressLine1 ?? null,
    postcode: p?.AddressInfo?.Postcode ?? null,
    connectors, maxPowerKw, score,
    raw: p,
  };
}

function useDebounced<T extends any[]>(fn: (...args: T) => void, ms: number) {
  const t = useRef<number | null>(null);
  return (...args: T) => {
    if (t.current) window.clearTimeout(t.current);
    t.current = window.setTimeout(() => fn(...args), ms) as unknown as number;
  };
}

/** Child that fires once with the Leaflet map instance */
const ReadyCapture: React.FC<{ onReady: (map: L.Map) => void }> = ({ onReady }) => {
  const map = useMap();
  useEffect(() => {
    // Leaflet 'load' may not have fired yet, but useMap gives a usable instance
    onReady(map as unknown as L.Map);
  }, [map, onReady]);
  return null;
};

const SearchBox: React.FC<{ onLocate: (ll: LatLngLike | null, zoom?: number) => void }> = ({ onLocate }) => {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('format', 'json');
      url.searchParams.set('q', q);
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('limit', '1');
      url.searchParams.set('countrycodes', 'gb'); // focus UK

      const r = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      const arr = (await r.json()) as any[];
      if (arr?.length) {
        const hit = arr[0];
        const lat = parseFloat(hit.lat), lon = parseFloat(hit.lon);
        onLocate({ lat, lng: lon }, 13);
      } else {
        alert('No results for that place/postcode.');
      }
    } catch (e) {
      console.error(e);
      alert('Search failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="z-[1000] absolute top-4 left-4 bg-black/80 text-white rounded-xl px-3 py-3 flex flex-wrap items-center gap-2">
      <button onClick={() => onLocate(null)} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20">My location</button>
      <button onClick={() => window.location.reload()} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20">Reset view</button>
      <button id="markersBtn" className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20">Markers</button>
      <button id="heatBtn" className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20">Heatmap</button>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search postcode or area (e.g. EC1A)"
        className="px-3 py-2 rounded-lg bg-white/10 outline-none w-80"
      />
      <button onClick={search} disabled={loading} className="px-3 py-2 rounded-lg bg-emerald-500 text-black hover:bg-emerald-400">
        {loading ? 'Searching…' : 'Search'}
      </button>
    </div>
  );
};

const FetchOnMove: React.FC<{
  setStations: React.Dispatch<React.SetStateAction<Station[]>>,
  onToggleWires: (w: { attach: () => void; detach: () => void }) => void
}> = ({ setStations, onToggleWires }) => {
  const map = useMap();
  const debounced = useDebounced(async () => {
    const center = map.getCenter();
    const radiusKm = Math.max(2, Math.min(25, Math.round(kmFromBounds(map.getBounds()))));
    const url = `/api/stations?lat=${center.lat.toFixed(5)}&lon=${center.lng.toFixed(5)}&radiusKm=${radiusKm}`;
    const r = await fetch(url, { cache: 'no-store' });
    const arr = await r.json();
    const out: Station[] = (Array.isArray(arr) ? arr : []).map(normalise).filter(Boolean) as Station[];
    setStations(out);
  }, 350);

  useEffect(() => {
    const onMove = () => debounced();
    map.on('moveend', onMove);
    map.on('zoomend', onMove);
    debounced(); // initial fetch
    onToggleWires({
      attach: () => { map.on('moveend', onMove); map.on('zoomend', onMove); },
      detach: () => { map.off('moveend', onMove); map.off('zoomend', onMove); },
    });
    return () => { map.off('moveend', onMove); map.off('zoomend', onMove); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
};

const Model1HeatmapPage: React.FC = () => {
  const [stations, setStations] = useState<Station[]>([]);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showHeat, setShowHeat] = useState(false);

  const wires = useRef<{ attach: () => void; detach: () => void } | null>(null);
  const heatLayerRef = useRef<any>(null);

  // Type-only ref for the Leaflet map; actual Leaflet is dynamically imported in onMapReady
  const mapRef = useRef<L.Map | null>(null);
  const LRef = useRef<any>(null); // holds dynamically imported Leaflet

  const onMapReady = useCallback(async (map: L.Map) => {
    mapRef.current = map;

    // Dynamically import Leaflet and the heat plugin on the client
    const leaflet = await import('leaflet');
    await import('leaflet.heat');
    LRef.current = leaflet;

    // UI toggles
    document.getElementById('markersBtn')?.addEventListener('click', () => setShowMarkers(s => !s));
    document.getElementById('heatBtn')?.addEventListener('click', () => setShowHeat(s => !s));
  }, []);

  const handleLocate = async (ll: LatLngLike | null, zoom = 13) => {
    const map = mapRef.current; if (!map) return;
    if (ll) {
      map.setView([ll.lat, ll.lng], zoom);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => map.setView([pos.coords.latitude, pos.coords.longitude], 13),
        () => alert('Location permission denied')
      );
    }
  };

  // Manage heat layer (create only after Leaflet is loaded)
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;

    if (showHeat) {
      const points = stations.map(s => [s.lat, s.lon, Math.max(0.05, Math.min(1, s.score ?? 0.2))]) as [number, number, number][];
      if (!heatLayerRef.current) {
        // create layer (leaflet.heat is already imported)
        // @ts-ignore
        heatLayerRef.current = (L as any).heatLayer(points, { radius: 22, blur: 20, maxZoom: 17 });
        heatLayerRef.current.addTo(map);
      } else {
        heatLayerRef.current.setLatLngs(points);
      }
    } else if (heatLayerRef.current) {
      heatLayerRef.current.remove();
      heatLayerRef.current = null;
    }
  }, [showHeat, stations]);

  const markers = useMemo(() => (showMarkers ? stations : []), [showMarkers, stations]);

  return (
    <div className="w-full h-[calc(100vh-64px)] relative">
      <SearchBox onLocate={handleLocate} />
      <MapContainer
        center={[51.5072, -0.1276]}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
      >
        {/* Capture the map instance once, using a child that calls useMap() */}
        <ReadyCapture onReady={onMapReady} />

        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Data wiring */}
        {/* @ts-ignore */}
        <FetchOnMove setStations={setStations} onToggleWires={(w) => (wires.current = w)} />

        {/* Markers */}
        {markers.map((s, i) => (
          <CircleMarker key={`${s.lat},${s.lon},${i}`} center={[s.lat, s.lon]} radius={6} fillOpacity={0.85}>
            <Popup>
              <div style={{ minWidth: 220 }}>
                <b>{s.name ?? 'Charging site'}</b>
                <div>{s.postcode ?? s.addr ?? ''}</div>
                <div>Max power: {s.maxPowerKw ?? 0} kW</div>
                <div>Connectors: {s.connectors ?? 0}</div>
                <div>Score: {(s.score ?? 0).toFixed(2)}</div>
                <i>Feedback coming soon</i>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
};

export default Model1HeatmapPage;
