'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons in Next bundlers
// @ts-ignore
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
// @ts-ignore
import iconUrl from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

// Load leaflet.heat only on the client
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('leaflet.heat');
}

type Station = {
  id: string | number;
  lat: number;
  lng: number;
  name?: string;
  address?: string;
  postcode?: string;
  connectors?: number;
};

const LONDON_CENTER: [number, number] = [51.5074, -0.1278];
const LONDON_BBOX = { north: 51.6919, south: 51.2867, east: 0.3340, west: -0.5104 };

/** capture L.Map instance without relying on whenReady/whenCreated props */
function CaptureMapRef({ onMap }: { onMap: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onMap(map); }, [map, onMap]);
  return null;
}

function HeatLayer({ points }: { points: [number, number, number?][] }) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    if (!(L as any).heatLayer) return;
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!points.length) return;
    layerRef.current = (L as any).heatLayer(points, { radius: 20, blur: 12, maxZoom: 17 });
    layerRef.current.addTo(map);
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points]);

  return null;
}

export default function EVHeatmapPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [showHeat, setShowHeat] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showPolys, setShowPolys] = useState(true);
  const [polys, setPolys] = useState<any | null>(null);

  // Fetch once: full London from OCM (server route handles source + fallback)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `/api/stations?source=ocm&north=${LONDON_BBOX.north}&south=${LONDON_BBOX.south}&east=${LONDON_BBOX.east}&west=${LONDON_BBOX.west}&max=3000`;
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled && data?.items) setStations(data.items);
      } catch {
        if (!cancelled) setStations([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // load council polygons (sample file or your prod file)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/data/councils.sample.geojson', { cache: 'no-store' });
        if (r.ok) setPolys(await r.json());
      } catch {}
    })();
  }, []);

  const heatPoints = useMemo<[number, number, number?][]>(() =>
    stations.map((s) => [s.lat, s.lng, 0.7]), [stations]);

  async function geoSearch(term: string) {
    const t = term.trim();
    if (!t || !mapRef.current) return;

    // Try UK postcodes first
    try {
      const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(t)}`);
      const j = await r.json();
      if (j?.status === 200 && j?.result?.latitude) {
        mapRef.current.setView([j.result.latitude, j.result.longitude], 14);
        return;
      }
    } catch {}

    // Fallback to Nominatim
    try {
      const r2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(t)}&limit=1`, {
        headers: { 'Accept-Language': 'en-GB' },
      });
      const j2 = await r2.json();
      if (Array.isArray(j2) && j2.length) {
        const p = j2[0];
        mapRef.current.setView([Number(p.lat), Number(p.lon)], 14);
      }
    } catch {}
  }

  async function quickFeedback(s: Station) {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          at: new Date().toISOString(),
          stationId: s.id,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          note: 'quick',
        }),
      });
      alert('Thanks! Feedback recorded.');
    } catch {
      alert('Could not send feedback right now.');
    }
  }

  const mapRef = useRef<L.Map | null>(null);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      {/* Controls (not under zoom buttons) */}
      <div style={{
        position: 'absolute', zIndex: 1000, left: 12, top: 12,
        display: 'flex', gap: 12, background: 'white', padding: '6px 10px',
        borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        <label><input type="checkbox" checked={showHeat} onChange={e => setShowHeat(e.target.checked)} /> Heatmap</label>
        <label><input type="checkbox" checked={showMarkers} onChange={e => setShowMarkers(e.target.checked)} /> Markers</label>
        <label><input type="checkbox" checked={showPolys} onChange={e => setShowPolys(e.target.checked)} /> Polygons</label>
      </div>

      <SearchBox onSearch={geoSearch} />

      <div style={{
        position: 'absolute', zIndex: 1000, right: 12, top: 12,
        background: 'white', padding: '6px 10px', borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        stations: {stations.length}
      </div>

      <MapContainer
        center={LONDON_CENTER}
        zoom={11}
        style={{ width: '100%', height: '100%' }}
      >
        {/* capture L.Map instance here (avoids whenReady/whenCreated typing issues) */}
        <CaptureMapRef onMap={(m) => { mapRef.current = m; }} />

        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {showHeat && <HeatLayer points={heatPoints} />}

        {showMarkers && stations.map((s) => (
          <Marker key={String(s.id)} position={[s.lat, s.lng] as any}>
            <Popup>
              <div style={{ minWidth: 220 }}>
                <strong>{s.name ?? 'EV Charger'}</strong><br />
                {s.address && <>{s.address}<br /></>}
                {s.postcode && <>{s.postcode}<br /></>}
                {typeof s.connectors === 'number' && <>Connectors: {s.connectors}<br /></>}
                <button
                  onClick={() => quickFeedback(s)}
                  style={{
                    marginTop: 8, background: '#ff7a00', color: '#fff',
                    border: 0, borderRadius: 6, padding: '6px 10px', cursor: 'pointer'
                  }}
                >
                  Quick Feedback
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {showPolys && polys && (
          <GeoJSON data={polys as any} style={() => ({ color: '#2b6cb0', weight: 1.4, fillOpacity: 0.08 })} />
        )}
      </MapContainer>
    </div>
  );
}

function SearchBox({ onSearch }: { onSearch: (q: string) => void }) {
  const [q, setQ] = useState('');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSearch(q); }}
      style={{
        position: 'absolute', zIndex: 1000, left: '50%', transform: 'translateX(-50%)',
        top: 12, background: 'white', borderRadius: 8, padding: 6,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}
    >
      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search postcode or place..."
        style={{ width: 360, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6 }}
      />
    </form>
  );
}
