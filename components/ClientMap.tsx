"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import L, { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat"; // plugin (no TS types)

import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMapEvents,
} from "react-leaflet";

type Station = {
  id: string | number | null;
  name: string | null;
  addr: string | null;
  postcode: string | null;
  lat: number;
  lon: number;
  connectors: number;
  reports: number;
  downtime: number;
  source: string;
};

type Props = {
  initialCenter: [number, number];
  initialZoom: number;
  showHeatmap: boolean;
  showMarkers: boolean;
  showCouncil: boolean;
  onStationsCount?: (n: number) => void;
};

function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, ms: number) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (...args: Parameters<T>) => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => fn(...args), ms);
  };
}

/** Heatmap layer wrapper (updates when points change). */
function HeatmapLayer({ points }: { points: Station[] }) {
  const map = useMapEvents({});
  // leaflet.heat doesn't have TS types; use generic L.Layer
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!layerRef.current) {
      // Create, add to map, then store in ref so TS never sees a possibly-null when calling addTo.
      // @ts-ignore leaflet.heat augments L at runtime
      const layer = L.heatLayer([], { radius: 20, blur: 15, maxZoom: 17 }).addTo(map);
      layerRef.current = layer as unknown as L.Layer;
    }

    // Update points
    // @ts-ignore setLatLngs is provided by leaflet.heat
    const heat = layerRef.current as any;
    const heatPoints = points.map((p) => [p.lat, p.lon, 0.6] as [number, number, number]);
    heat.setLatLngs(heatPoints);

    return () => {
      // keep the layer mounted between updates
    };
  }, [map, points]);

  useEffect(() => {
    return () => {
      if (layerRef.current) {
        layerRef.current.remove();
        layerRef.current = null;
      }
    };
  }, []);

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
  const [council, setCouncil] = useState<Station[]>([]);

  const fetchData = async (m: L.Map) => {
    const b = m.getBounds();
    const west = b.getWest();
    const south = b.getSouth();
    const east = b.getEast();
    const north = b.getNorth();
    const zoom = m.getZoom();

    // Stations
    try {
      const url =
        `/api/stations?west=${west}&south=${south}` +
        `&east=${east}&north=${north}&zoom=${zoom}`;
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      const items: Station[] = Array.isArray(json?.items) ? json.items : [];
      setStations(items);
      onStationsCount?.(items.length);
    } catch {
      setStations([]);
      onStationsCount?.(0);
    }

    // Council (only if enabled)
    if (showCouncil) {
      try {
        const cu =
          `/api/council?west=${west}&south=${south}` +
          `&east=${east}&north=${north}&zoom=${zoom}`;
        const cres = await fetch(cu, { cache: "no-store" });
        const cjson = await cres.json();
        const citems: Station[] = Array.isArray(cjson?.items) ? cjson.items : [];
        setCouncil(citems);
      } catch {
        setCouncil([]);
      }
    } else {
      setCouncil([]);
    }
  };

  const debouncedFetch = useDebouncedCallback((m: L.Map) => fetchData(m), 250);

  /** Re-fetch on pan/zoom. */
  function ViewEvents() {
    useMapEvents({
      moveend() {
        const m = mapRef.current;
        if (m) debouncedFetch(m);
      },
      zoomend() {
        const m = mapRef.current;
        if (m) debouncedFetch(m);
      },
    });
    return null;
  }

  /** If council toggle changes, refresh. */
  useEffect(() => {
    const m = mapRef.current;
    if (m) debouncedFetch(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCouncil]);

  const center = useMemo<LatLngExpression>(() => initialCenter, [initialCenter]);

  return (
    <MapContainer
      center={center}
      zoom={initialZoom}
      className="w-full h-[calc(100vh-140px)] rounded-xl overflow-hidden"
      whenCreated={(leafletMap: L.Map) => {
        mapRef.current = leafletMap;
        // initial fetch on mount
        debouncedFetch(leafletMap);
      }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <ViewEvents />

      {/* HEATMAP */}
      {showHeatmap && stations.length > 0 && <HeatmapLayer points={stations} />}

      {/* MARKERS */}
      {showMarkers &&
        stations.map((s) => (
          <CircleMarker
            key={`st-${s.id}-${s.lat}-${s.lon}`}
            center={[s.lat, s.lon]}
            radius={6}
            weight={1}
            fillOpacity={0.9}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-medium">{s.name ?? "EV Charging"}</div>
                {s.addr && <div>{s.addr}</div>}
                {s.postcode && <div>{s.postcode}</div>}
                <div>Connectors: {s.connectors}</div>
                <div>Source: {s.source}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}

      {/* COUNCIL */}
      {showCouncil &&
        council.map((c) => (
          <CircleMarker
            key={`c-${c.id}-${c.lat}-${c.lon}`}
            center={[c.lat, c.lon]}
            radius={6}
            weight={1}
            fillOpacity={0.9}
            pathOptions={{ color: "#0a7", fillColor: "#0a7" }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-medium">{c.name ?? "Council EV"}</div>
                {c.addr && <div>{c.addr}</div>}
                {c.postcode && <div>{c.postcode}</div>}
                <div>Connectors: {c.connectors}</div>
                <div>Source: {c.source}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
    </MapContainer>
  );
}
