"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import L, { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat"; // leaflet.heat plugin

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

function useDebouncedCallback(fn: (...args: any[]) => void, ms: number) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (...args: any[]) => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => fn(...args), ms);
  };
}

// Simple heatmap layer wrapper that updates when points change.
function HeatmapLayer({ points }: { points: Station[] }) {
  const map = useMapEvents({});
  const layerRef = useRef<L.HeatLayer | null>(null);

  useEffect(() => {
    if (!map) return;
    if (!layerRef.current) {
      // @ts-ignore - leaflet.heat extends L with heatLayer
      layerRef.current = L.heatLayer([], { radius: 20, blur: 15, maxZoom: 17 });
      layerRef.current.addTo(map);
    }

    const heatPoints = points.map((p) => [p.lat, p.lon, 0.6] as [number, number, number]);
    layerRef.current.setLatLngs(heatPoints);

    return () => {
      // keep layer alive across prop changes; remove only when unmounting component
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
      const u =
        `/api/stations?west=${west}&south=${south}` +
        `&east=${east}&north=${north}&zoom=${zoom}`;
      const res = await fetch(u, { cache: "no-store" });
      const json = await res.json();
      const items: Station[] = Array.isArray(json?.items) ? json.items : [];
      setStations(items);
      onStationsCount?.(items.length);
    } catch {
      setStations([]);
      onStationsCount?.(0);
    }

    // Council (fetch only if the layer is enabled to save calls)
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

  // Re-fetch on map interactions
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

  // If user toggles council on/off, refresh current bounds
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
        // Kick off the very first fetch immediately on mount
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
