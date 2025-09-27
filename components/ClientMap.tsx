// components/ClientMap.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMapEvents, CircleMarker, Popup } from "react-leaflet";
import type { LatLngBounds, LatLngExpression } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

type Station = {
  id: number | string;
  name: string | null;
  lat: number;
  lon: number;
  connectors?: number;
  source?: string;
};

type CouncilSite = {
  id: string | number;
  name: string | null;
  lat: number;
  lon: number;
  source?: string; // "council"
};

type Props = {
  initialCenter: LatLngExpression;
  initialZoom: number;
  showHeatmap: boolean;
  showMarkers: boolean;
  showCouncil: boolean;
  onStationsCount?: (n: number) => void;
};

const FETCH_DEBOUNCE_MS = 400;
const COUNCIL_CACHE_TTL_MS = 60_000;

// simple in-memory caches
const stationsCache = new Map<string, Station[]>();
const councilCache = new Map<string, { at: number; items: CouncilSite[] }>();

function bboxKey(b: LatLngBounds, zoom: number, pad = 0) {
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  const west = sw.lng - pad;
  const south = sw.lat - pad;
  const east = ne.lng + pad;
  const north = ne.lat + pad;
  return `${west.toFixed(4)}|${south.toFixed(4)}|${east.toFixed(4)}|${north.toFixed(4)}|z${zoom}`;
}

async function fetchJSON<T>(url: string, tries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

function useDebounced(fn: (...args: any[]) => void, delay: number) {
  const t = useRef<number | null>(null);
  return useCallback(
    (...args: any[]) => {
      if (t.current) window.clearTimeout(t.current);
      t.current = window.setTimeout(() => fn(...args), delay);
    },
    [fn, delay]
  );
}

function HeatmapLayer({ points }: { points: Station[] }) {
  const map = useMapEvents({});
  const layerRef = useRef<any>(null);

  useEffect(() => {
    if (!map) return;

    if (!layerRef.current) {
      // @ts-ignore leaflet.heat augments L at runtime
      layerRef.current = L.heatLayer([], { radius: 20, blur: 15, maxZoom: 17 });
      layerRef.current.addTo(map);
    }

    // @ts-ignore setLatLngs is provided by leaflet.heat
    layerRef.current.setLatLngs(points.map(p => [p.lat, p.lon, Math.min(1, (p.connectors ?? 1) / 4)]));
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points]);

  return null;
}

export default function ClientMap({
  initialCenter,
  initialZoom,
  showHeatmap,
  showMarkers,
  showCouncil,
  onStationsCount,
}: Props) {
  const mapRef = useRef<L.Map | null>(null);

  const [stations, setStations] = useState<Station[]>([]);
  const [councilSites, setCouncilSites] = useState<CouncilSite[]>([]);

  const tileUrl = useMemo(
    () => "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    []
  );

  const doFetch = useCallback(
    async (map: L.Map) => {
      const bounds = map.getBounds();
      const zoom = Math.round(map.getZoom());

      // slight padding so items just outside the viewport still render when panning
      const PAD = 0.02;

      // ----- stations -----
      const kStations = bboxKey(bounds, zoom, PAD);
      if (stationsCache.has(kStations)) {
        const items = stationsCache.get(kStations)!;
        setStations(items);
        onStationsCount?.(items.length);
      } else {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        const url =
          `/api/stations?west=${sw.lng - PAD}&south=${sw.lat - PAD}` +
          `&east=${ne.lng + PAD}&north=${ne.lat + PAD}&zoom=${zoom}`;

        try {
          const data = await fetchJSON<{ items: Station[] }>(url, 2);
          stationsCache.set(kStations, data.items);
          setStations(data.items);
          onStationsCount?.(data.items.length);
        } catch {
          // leave previous stations on transient failures
        }
      }

      // ----- council (improved) -----
      const kCouncil = bboxKey(bounds, Math.max(zoom, 11), PAD * 1.5); // a bit more padding & min zoom to get enough data
      const now = Date.now();
      const cached = councilCache.get(kCouncil);
      if (cached && now - cached.at < COUNCIL_CACHE_TTL_MS) {
        setCouncilSites(cached.items);
      } else {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        const url =
          `/api/council?west=${sw.lng - PAD * 1.5}&south=${sw.lat - PAD * 1.5}` +
          `&east=${ne.lng + PAD * 1.5}&north=${ne.lat + PAD * 1.5}&zoom=${Math.max(zoom, 11)}`;

        try {
          const data = await fetchJSON<{ items: CouncilSite[] }>(url, 3);
          const items = data.items ?? [];
          councilCache.set(kCouncil, { at: now, items });
          setCouncilSites(items);
        } catch {
          // soft-fail: keep the old list if fetch fails
        }
      }
    },
    [onStationsCount]
  );

  const debouncedFetch = useDebounced((m: L.Map) => void doFetch(m), FETCH_DEBOUNCE_MS);

  const MapEvents = () => {
    useMapEvents({
      moveend: () => mapRef.current && debouncedFetch(mapRef.current),
      zoomend: () => mapRef.current && debouncedFetch(mapRef.current),
    });
    return null;
  };

  return (
    <MapContainer
      center={initialCenter}
      zoom={initialZoom}
      className="w-full h-[calc(100vh-140px)] rounded-xl overflow-hidden"
      whenReady={(ctx) => {
        const leafletMap = (ctx as any).target as L.Map;
        mapRef.current = leafletMap;
        debouncedFetch(leafletMap);
      }}
    >
      <TileLayer url={tileUrl} attribution='&copy; OpenStreetMap contributors' />

      {/* live fetch triggers */}
      <MapEvents />

      {/* heatmap over stations */}
      {showHeatmap && stations.length > 0 && <HeatmapLayer points={stations} />}

      {/* station markers (blue) */}
      {showMarkers &&
        stations.map((s) => (
          <CircleMarker
            key={`st-${s.id}`}
            center={[s.lat, s.lon]}
            radius={5}
            pathOptions={{ color: "#1d4ed8", fillOpacity: 0.9 }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-medium mb-1">{s.name ?? "EV Charging"}</div>
                <div>Source: {s.source ?? "osm"}</div>
                {typeof s.connectors === "number" && <div>Connectors: {s.connectors}</div>}
              </div>
            </Popup>
          </CircleMarker>
        ))}

      {/* council markers (teal), with sturdier fetching/caching */}
      {showCouncil &&
        councilSites.map((c) => (
          <CircleMarker
            key={`c-${c.id}`}
            center={[c.lat, c.lon]}
            radius={6}
            pathOptions={{ color: "#0d9488", fillOpacity: 0.95 }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-medium mb-1">{c.name ?? "Council site"}</div>
                <div>Source: {c.source ?? "council"}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
    </MapContainer>
  );
}
