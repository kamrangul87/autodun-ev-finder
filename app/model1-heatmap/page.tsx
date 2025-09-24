// app/model1-heatmap/page.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useMap } from 'react-leaflet';

// Load react-leaflet components dynamically (avoids SSR issues)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer     = dynamic(() => import('react-leaflet').then(m => m.TileLayer),     { ssr: false });
const CircleMarker  = dynamic(() => import('react-leaflet').then(m => m.CircleMarker),  { ssr: false });
const Popup         = dynamic(() => import('react-leaflet').then(m => m.Popup),         { ssr: false });

// IMPORTANT: do NOT import 'leaflet' at top-level (causes "window is not defined" on SSR)
// We’ll load it dynamically when the map is ready.
// Also, keep leaflet.heat’s runtime under the same dynamic load.

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

/** Child helper that fires once the map instance is available */
const OnMapReady: React.FC<{ onReady: (map: any) => void }> = ({ onReady }) => {
  const map = useMap();
  useEffect(() => {
    onReady(map);
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
      url.searchParams.set('countrycodes', 'gb'); // focus UK; remove for global

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
  setHeatData: React.Dispatch<React.SetStateAction<any[]>>,
  zoom: number,
  showMarkers: boolean,
  showHeat: boolean,
  onToggleWires: (w: { attach: () => void; detach: () => void }) => void
}> = ({ setStations, setHeatData, zoom, showMarkers, showHeat, onToggleWires }) => {
  const map = useMap();
  const debounced = useDebounced(async () => {
    const center = map.getCenter();
    const bounds = map.getBounds();
    const radiusKm = Math.max(2, Math.min(25, Math.round(kmFromBounds(bounds))));
    if (zoom >= 13 && showMarkers) {
      const url = `/api/stations?lat=${center.lat.toFixed(5)}&lon=${center.lng.toFixed(5)}&radiusKm=${radiusKm}`;
      const r = await fetch(url, { cache: 'no-store' });
      const arr = await r.json();
      const out: Station[] = (Array.isArray(arr) ? arr : []).map(normalise).filter(Boolean) as Station[];
      setStations(out);
    } else {
      setStations([]);
    }
    if (showHeat) {
      const url = `/api/heatmap?lat=${center.lat.toFixed(5)}&lon=${center.lng.toFixed(5)}&radiusKm=${radiusKm}`;
      const r = await fetch(url, { cache: 'no-store' });
      const arr = await r.json();
      setHeatData(Array.isArray(arr) ? arr : []);
    } else {
      setHeatData([]);
    }
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
  }, [map, zoom, showMarkers, showHeat]);

  return null;
};


const Model1HeatmapPage: React.FC = () => {
  const [stations, setStations] = useState<Station[]>([]);
  const [heatData, setHeatData] = useState<any[]>([]);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showHeat, setShowHeat] = useState(false);
  const [center, setCenter] = useState<[number, number]>([51.5072, -0.1276]);
  const [zoom, setZoom] = useState(12);
  const [tempMarkerLatLng, setTempMarkerLatLng] = useState<LatLngLike | null>(null);
  const [showZoomMsg, setShowZoomMsg] = useState(false);

  const wires = useRef<{ attach: () => void; detach: () => void } | null>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null); // holds dynamically imported Leaflet
  const tempMarkerTimeout = useRef<any>(null);

  const onMapReady = async (map: any) => {
    mapRef.current = map;
    // Dynamically import Leaflet and the heat plugin on the client
    const leaflet = await import('leaflet');
    await import('leaflet.heat');
    LRef.current = leaflet;
    // Setup custom panes for zIndex if needed
    if (!map.getPane('overlay-councils')) {
      map.createPane('overlay-councils');
      map.getPane('overlay-councils').style.zIndex = 300;
    }
    if (!map.getPane('heatmap')) {
      map.createPane('heatmap');
      map.getPane('heatmap').style.zIndex = 350;
    }
    // Listen for zoom and move events
    map.on('zoomend', () => {
      setZoom(map.getZoom());
      setShowZoomMsg(map.getZoom() < 13);
    });
    map.on('moveend', () => {
      const c = map.getCenter();
      setCenter([c.lat, c.lng]);
    });
    setZoom(map.getZoom());
    setShowZoomMsg(map.getZoom() < 13);
    setCenter([map.getCenter().lat, map.getCenter().lng]);
    document.getElementById('markersBtn')?.addEventListener('click', () => setShowMarkers(s => !s));
    document.getElementById('heatBtn')?.addEventListener('click', () => setShowHeat(s => !s));
  };

  const handleLocate = async (ll: LatLngLike | null, z = 14) => {
    const map = mapRef.current; if (!map) return;
    if (ll) {
      map.setView([ll.lat, ll.lng], Math.max(z, 14));
      setTempMarkerLatLng(ll);
      if (tempMarkerTimeout.current) clearTimeout(tempMarkerTimeout.current);
      tempMarkerTimeout.current = setTimeout(() => setTempMarkerLatLng(null), 6000);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => map.setView([pos.coords.latitude, pos.coords.longitude], 13),
        () => alert('Location permission denied')
      );
    }
  };

  // Remove temp marker on next search
  useEffect(() => {
    return () => { if (tempMarkerTimeout.current) clearTimeout(tempMarkerTimeout.current); };
  }, []);

  const markers = useMemo(() => (showMarkers && zoom >= 13 ? stations : []), [showMarkers, stations, zoom]);

  return (
    <div className="w-full h-[calc(100vh-64px)] relative">
      <SearchBox onLocate={handleLocate} />
      {showZoomMsg && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-xl z-[1000] text-sm shadow">
          Zoom in to see markers
        </div>
      )}
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        whenCreated={map => onMapReady(map)}
      >
        <OnMapReady onReady={onMapReady} />
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* Data wiring */}
        {/* @ts-ignore */}
        <FetchOnMove
          setStations={setStations}
          setHeatData={setHeatData}
          zoom={zoom}
          showMarkers={showMarkers}
          showHeat={showHeat}
          onToggleWires={w => (wires.current = w)}
        />
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
        {/* Temporary marker for search */}
        {tempMarkerLatLng && (
          <CircleMarker center={[tempMarkerLatLng.lat, tempMarkerLatLng.lng]} radius={10} fillOpacity={0.7} color="#00f" />
        )}
        {/* Heatmap layer (if needed, can be implemented here or in a custom component) */}
        {/* Councils overlay would go here, in pane="overlay-councils" if implemented */}
      </MapContainer>
    </div>
  );
};

export default Model1HeatmapPage;
