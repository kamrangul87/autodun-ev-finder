'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Tooltip,
  LayerGroup,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';

// ---------------- Types ----------------
type Station = {
  id: string | number;
  name?: string | null;
  addr?: string | null;
  postcode?: string | null;
  lat: number;
  lon: number;
  powerKw?: number | null;
  connectors?: string[];
  price?: number | null;
  rating?: number | null;
};

// -------------- Utilities --------------
const debounce = <F extends (...args: any[]) => void>(fn: F, ms = 450) => {
  let t: any;
  return (...args: Parameters<F>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

// Request coordination (avoid races)
let lastReqId = 0;
let lastController: AbortController | null = null;

// ------------- Child Hook --------------
function BboxWatcher({ onBbox }: { onBbox: (b: L.LatLngBounds) => void }) {
  const map = useMap();
  const debounced = useRef<(b: L.LatLngBounds) => void>();

  useEffect(() => {
    debounced.current = debounce((b: L.LatLngBounds) => onBbox(b), 450);
  }, [onBbox]);

  useEffect(() => {
    const onMoveEnd = () => {
      const b = map.getBounds();
      debounced.current?.(b);
    };
    // initial load
    onMoveEnd();
    map.on('moveend', onMoveEnd);
    map.on('zoomend', onMoveEnd);
    return () => {
      map.off('moveend', onMoveEnd);
      map.off('zoomend', onMoveEnd);
    };
  }, [map]);

  return null;
}

// ------------- Main Page ---------------
export default function Page() {
  // UI state
  const [minKw, setMinKw] = useState<number>(0);
  const [connector, setConnector] = useState<string>('any');
  const [query, setQuery] = useState<string>('');

  // Map data state
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showHeat, setShowHeat] = useState(false);

  const searchParams = useMemo(() => {
    const sp = new URLSearchParams();
    if (minKw > 0) sp.set('minPower', String(minKw));
    if (connector && connector !== 'any') sp.set('conn', connector);
    if (query) sp.set('q', query);
    return sp;
  }, [minKw, connector, query]);

  const fetchStationsFor = async (bounds: L.LatLngBounds) => {
    const reqId = ++lastReqId;
    if (lastController) lastController.abort();
    const controller = new AbortController();
    lastController = controller;

    const bbox = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ].join(',');

    const url = `/api/map?bbox=${bbox}&${searchParams.toString()}`;

    try {
      setLoading(true);
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Station[];
      if (reqId !== lastReqId) return; // only latest wins
      setStations(data);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Stations fetch failed:', err);
    } finally {
      if (reqId === lastReqId) setLoading(false);
    }
  };

  // Map ref (compatible with your React-Leaflet types)
  const mapRef = useRef<any>(null);

  // Re-fetch when filters/search change
  const refetchForCurrentView = () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds =
      map.getBounds?.() ??
      map.leafletElement?.getBounds?.(); // handles different react-leaflet versions
    if (bounds) fetchStationsFor(bounds);
  };

  useEffect(() => {
    refetchForCurrentView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="w-full h-[calc(100vh-80px)] relative">
      {/* Toolbar (simplified) */}
      <div
        style={{
          position: 'absolute',
          zIndex: 1000,
          left: 16,
          right: 16,
          top: 16,
          padding: 12,
          background: 'rgba(0,0,0,0.65)',
          color: 'white',
          borderRadius: 12,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <label>
          Min kW:{' '}
          <input
            type="number"
            value={minKw}
            min={0}
            onChange={(e) => setMinKw(Number(e.target.value || 0))}
            style={{ width: 70 }}
          />
        </label>
        <label>
          Connector:{' '}
          <select value={connector} onChange={(e) => setConnector(e.target.value)}>
            <option value="any">Any</option>
            <option value="CCS2">CCS2</option>
            <option value="CHAdeMO">CHAdeMO</option>
            <option value="Type2">Type 2</option>
          </select>
        </label>
        <input
          placeholder="Search postcode or area (e.g. EC1A)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <button onClick={refetchForCurrentView}>Search</button>
        <button onClick={() => setShowMarkers((s) => !s)}>Markers {showMarkers ? '✅' : '❌'}</button>
        <button onClick={() => setShowHeat((s) => !s)}>Heatmap {showHeat ? '✅' : '❌'}</button>
        {loading && <span style={{ marginLeft: 'auto' }}>Loading…</span>}
      </div>

      {/* Map */}
      <MapContainer
        ref={mapRef as any}
        whenReady={(ctx: any) => {
          // keep a handle to the Leaflet map (works across versions)
          mapRef.current = ctx?.target ?? mapRef.current;
        }}
        center={[51.5074, -0.1278]}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Debounced bbox watcher drives fetching */}
        <BboxWatcher onBbox={fetchStationsFor} />

        {/* Keep layers mounted; toggle visibility only */}
        {showMarkers && (
          <LayerGroup pane="markers">
            {stations.map((s) => (
              <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={6}>
                <Popup>
                  <strong>{s.name ?? 'Charging point'}</strong>
                  <div>{s.addr ?? s.postcode ?? ''}</div>
                  {s.powerKw ? <div>Power: {s.powerKw} kW</div> : null}
                  {s.connectors?.length ? <div>Connectors: {s.connectors.join(', ')}</div> : null}
                  {typeof s.price === 'number' ? <div>£{s.price.toFixed(2)}/kWh</div> : null}
                  {typeof s.rating === 'number' ? <div>Rating: {s.rating.toFixed(1)}</div> : null}
                </Popup>
                <Tooltip>{s.name ?? 'Charging point'}</Tooltip>
              </CircleMarker>
            ))}
          </LayerGroup>
        )}

        {showHeat && (
          <LayerGroup pane="heat">
            {/* Hook up your heat layer here */}
          </LayerGroup>
        )}
      </MapContainer>
    </div>
  );
}
