// app/model1-heatmap/page.tsx
'use client';

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  MutableRefObject,
  useCallback,
} from 'react';
import dynamic from 'next/dynamic';
import { useMap } from 'react-leaflet';
import FeedbackModal from '../components/FeedbackModal';

// React-Leaflet pieces (CSR only)
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer     = dynamic(() => import('react-leaflet').then(m => m.TileLayer),     { ssr: false });
const CircleMarker  = dynamic(() => import('react-leaflet').then(m => m.CircleMarker),  { ssr: false });
const Popup         = dynamic(() => import('react-leaflet').then(m => m.Popup),         { ssr: false });

type LatLngLike = { lat: number; lng: number };
type OcmPoi = any;
type Station = {
  lat: number; lon: number; name?: string | null;
  addr?: string | null; postcode?: string | null;
  connectors?: number; maxPowerKw?: number; score?: number;
  raw: OcmPoi;
};

// --- helpers ---
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

// fires when map instance is ready
const OnMapReady: React.FC<{ onReady: (map: any) => void }> = ({ onReady }) => {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
};

// ---------- UI bits ----------
const SearchBox: React.FC<{
  onLocate: (ll: LatLngLike | null, zoom?: number) => void;
  minPower: number;
  setMinPower: (n: number) => void;
  conn: string;
  setConn: (s: string) => void;
}> = ({ onLocate, minPower, setMinPower, conn, setConn }) => {
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
      url.searchParams.set('countrycodes', 'gb');

      const r = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      const arr = (await r.json()) as any[];
      if (arr?.length) {
        const hit = arr[0];
        onLocate({ lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) }, 13);
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

      {/* Filters */}
      <div className="ml-2 flex items-center gap-2">
        <label className="text-xs opacity-80">Min kW</label>
        <select
          value={minPower}
          onChange={(e) => setMinPower(parseInt(e.target.value, 10))}
          className="px-2 py-2 rounded bg-white/10 outline-none"
        >
          {[0,7,22,43,50,100,150].map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <label className="text-xs opacity-80">Connector</label>
        <select
          value={conn}
          onChange={(e) => setConn(e.target.value)}
          className="px-2 py-2 rounded bg-white/10 outline-none"
        >
          <option value="">Any</option>
          <option value="33">CCS (33)</option>
          <option value="25">Type-2 (25)</option>
          <option value="2">CHAdeMO (2)</option>
          <option value="27">Tesla (27)</option>
        </select>
      </div>

      {/* Search */}
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
  setStations: React.Dispatch<React.SetStateAction<Station[]>>;
  onToggleWires: (w: { attach: () => void; detach: () => void }) => void;
  minPower: number;
  conn: string;
  setLoadingChip: (b: boolean) => void;
}> = ({ setStations, onToggleWires, minPower, conn, setLoadingChip }) => {
  const map = useMap();

  const doFetch = useCallback(async () => {
    try {
      setLoadingChip(true);
      const center = map.getCenter();
      const radiusKm = Math.max(2, Math.min(25, Math.round(kmFromBounds(map.getBounds()))));
      const sp = new URLSearchParams({
        lat: center.lat.toFixed(5),
        lon: center.lng.toFixed(5),
        radiusKm: String(radiusKm),
      });
      if (minPower > 0) sp.set('minPower', String(minPower));
      if (conn) sp.set('conn', conn);

      const r = await fetch(`/api/stations?${sp.toString()}`, { cache: 'no-store' });
      const arr = await r.json();
      const out: Station[] = (Array.isArray(arr) ? arr : []).map(normalise).filter(Boolean) as Station[];
      setStations(out);
    } catch (e) {
      console.error(e);
      setStations([]);
    } finally {
      setLoadingChip(false);
    }
  }, [map, minPower, conn, setStations, setLoadingChip]);

  const debounced = useDebounced(doFetch, 300);

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
  }, [map, debounced, onToggleWires]);

  // re-fetch when filters change
  useEffect(() => { debounced(); }, [minPower, conn, debounced]);

  return null;
};

// Feedback summary (used in popup)
async function fetchFeedbackSummary(stationId: string) {
  try {
    const r = await fetch(`/api/feedback?stationId=${encodeURIComponent(stationId)}`, { cache: 'no-store' });
    const j = await r.json();
    if (j?.ok === false) return null;
    // Support both { ok:true, ... } and plain shape
    return (j.ok ? j : j) as { count: number; averageRating: number | null; reliability: number | null };
  } catch { return null; }
}

const MarkerWithPopup: React.FC<{ s: Station }> = ({ s }) => {
  const [fb, setFb] = useState<{count:number;averageRating:number|null;reliability:number|null} | null>(null);

  useEffect(() => {
    const id = s.raw?.ID != null ? String(s.raw.ID) : `${s.lat},${s.lon}`;
    fetchFeedbackSummary(id).then(setFb);
  }, [s]);

  return (
    <CircleMarker center={[s.lat, s.lon]} radius={6} fillOpacity={0.85}>
      <Popup>
        <div style={{ minWidth: 240 }}>
          <b>{s.name ?? 'Charging site'}</b>
          <div>{s.postcode ?? s.addr ?? ''}</div>
          <div>Max power: {s.maxPowerKw ?? 0} kW</div>
          <div>Connectors: {s.connectors ?? 0}</div>
          <div>Score: {(s.score ?? 0).toFixed(2)}</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
            <b>Community:</b>{' '}
            {fb ? (fb.averageRating != null ? `${fb.averageRating.toFixed(1)} / 5 (${fb.count})` : 'no ratings yet') : '…'}
          </div>
          <button
            style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid #92400e', background: '#fbbf24', color: '#111827', cursor: 'pointer' }}
            onClick={() => {
              const id = s.raw?.ID != null ? String(s.raw.ID) : `${s.lat},${s.lon}`;
              (window as any).openFeedbackModal?.(id);
            }}
          >
            Report status / feedback
          </button>
        </div>
      </Popup>
    </CircleMarker>
  );
};

const Model1HeatmapPage: React.FC = () => {
  const [stations, setStations] = useState<Station[]>([]);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showHeat, setShowHeat] = useState(false);
  const [loadingChip, setLoadingChip] = useState(false);

  // New: filter state
  const [minPower, setMinPower] = useState<number>(0);
  const [conn, setConn] = useState<string>(''); // OCM connectionTypeId

  const wires = useRef<{ attach: () => void; detach: () => void } | null>(null);
  const heatLayerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  // FB modal
  const [fbOpen, setFbOpen] = useState(false);
  const [fbStationId, setFbStationId] = useState<string | null>(null);
  useEffect(() => {
    (window as any).openFeedbackModal = (id: string) => {
      setFbStationId(id);
      setFbOpen(true);
    };
    return () => { delete (window as any).openFeedbackModal; };
  }, []);

  const onMapReady = async (map: any) => {
    mapRef.current = map;
    const leaflet = await import('leaflet');
    await import('leaflet.heat');
    LRef.current = leaflet;

    // toggles are exclusive
    document.getElementById('markersBtn')?.addEventListener('click', () => {
      setShowMarkers(true);
      setShowHeat(false);
    });
    document.getElementById('heatBtn')?.addEventListener('click', () => {
      setShowHeat(true);
      setShowMarkers(false);
    });
  };

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

  // Heat layer management
  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;

    if (showHeat) {
      const points = stations.map(s => [s.lat, s.lon, Math.max(0.05, Math.min(1, s.score ?? 0.2))]) as [number, number, number][];
      if (!heatLayerRef.current) {
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
      <SearchBox
        onLocate={handleLocate}
        minPower={minPower}
        setMinPower={setMinPower}
        conn={conn}
        setConn={setConn}
      />

      {/* tiny loading chip */}
      {loadingChip && (
        <div className="absolute top-4 right-4 z-[1000] bg-black/80 text-white text-xs px-3 py-2 rounded-lg">
          Updating…
        </div>
      )}

      <MapContainer
        center={[51.5072, -0.1276]}
        zoom={12}
        preferCanvas
        style={{ height: '100%', width: '100%' }}
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
          onToggleWires={(w) => (wires.current = w)}
          minPower={minPower}
          conn={conn}
          setLoadingChip={setLoadingChip}
        />

        {/* markers */}
        {markers.map((s, i) => (
          <MarkerWithPopup key={`${s.lat},${s.lon},${i}`} s={s} />
        ))}
      </MapContainer>

      {/* Feedback Modal */}
      <FeedbackModal
        stationId={fbStationId}
        open={fbOpen}
        onClose={() => setFbOpen(false)}
      />
    </div>
  );
};

export default Model1HeatmapPage;
