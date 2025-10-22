// components/EnhancedMapV2.jsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";

import StationDrawer from "./StationDrawer";
import { LocateMeButton } from "./LocateMeButton.tsx";
import { getCached, setCache } from "../lib/api-cache";
import { telemetry } from "../utils/telemetry.ts";
import { findNearestStation } from "../utils/haversine.ts";
import { CONNECTOR_COLORS } from "../lib/connectorCatalog"; // NEW

if (typeof window !== "undefined") {
  // @ts-ignore
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

const councilIcon = L.divIcon({
  html: '<div style="background:#9333ea;width:14px;height:14px;transform:rotate(45deg);border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.4)"></div>',
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const userLocationIcon = L.divIcon({
  html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 6px rgba(59,130,246,0.6)"></div>',
  className: "",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function MapInitializer() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

/* ... HeatmapLayer and StationMarker unchanged ... */

function CouncilMarkerLayer({ showCouncil, onMarkerClick }) {
  const map = useMap();
  const [councilStations, setCouncilStations] = useState([]);
  const fetchTimeoutRef = useRef(null);
  const lastBboxRef = useRef(null);

  const pick = (obj, keys) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
  };

  const fetchCouncilData = useCallback(async () => {
    if (!showCouncil) {
      setCouncilStations([]);
      return;
    }
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const bboxStr = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
    if (lastBboxRef.current === bboxStr) return;

    const cacheKey = `council_${bboxStr}`;
    const cached = getCached(cacheKey);
    if (cached) {
      setCouncilStations(cached.items || []);
      lastBboxRef.current = bboxStr;
      return;
    }

    try {
      const url = `/api/council-stations?bbox=${bboxStr}`;
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();
      if (response.ok && data.features) {
        const items = data.features.map((f) => {
          const p = f.properties || {};
          const ai = p.AddressInfo || {};
          // better postcode extraction (multiple common keys)
          const postcode =
            pick(p, ["postcode", "postCode", "Postcode", "PostalCode"]) ??
            pick(ai, ["Postcode", "PostalCode"]);
          return {
            id: Number(p.id),
            name: p.title || ai?.Title || "Unknown location",
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
            address: p.AddressLine1 || ai?.AddressLine1 || p.address || ai?.Title || undefined,
            town: p.Town || p.town || ai?.Town || ai?.City,
            postcode,                    // <— ensures drawer sees it
            connectors: [
              {
                type: "Unknown",
                quantity:
                  typeof p.NumberOfPoints === "number"
                    ? p.NumberOfPoints
                    : 1,
              },
            ],
            isCouncil: true,
          };
        });
        setCouncilStations(items);
        setCache(cacheKey, { items, count: items.length });
        lastBboxRef.current = bboxStr;
        telemetry.councilSelected("viewport", items.length);
      }
    } catch (err) {
      console.error("[CouncilMarkerLayer] Fetch error:", err);
    }
  }, [map, showCouncil]);

  useMapEvents({
    moveend: () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => fetchCouncilData(), 250);
    },
  });

  useEffect(() => {
    fetchCouncilData();
  }, [fetchCouncilData, showCouncil]);

  if (!showCouncil || councilStations.length === 0) return null;

  return (
    <MarkerClusterGroup chunkedLoading>
      {councilStations.map((station) => (
        <Marker
          key={`council-${station.id}`}
          position={[station.lat, station.lng]}
          icon={councilIcon}
          eventHandlers={{ click: () => onMarkerClick(station) }}
        />
      ))}
    </MarkerClusterGroup>
  );
}

/* ... UserLocationMarker, ViewportFetcher, LocateMeControl unchanged ... */

export default function EnhancedMap(props) {
  const {
    stations = [],
    showHeatmap = false,
    showMarkers = true,
    showCouncil = false,
    searchResult = null,
    shouldZoomToData = false,
    userLocation: externalUserLocation,
    onFetchStations,
    onLoadingChange,
    onToast,
    isLoading = false,
  } = props;

  /* state & handlers unchanged ... */

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* loading pill unchanged ... */}

      {/* Legend: add connector color hints (visual only) */}
      <div
        style={{
          position: "absolute",
          bottom: "10px",
          right: "10px",
          zIndex: 1000,
          background: "white",
          padding: "8px",
          borderRadius: "8px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          fontSize: "11px",
          minWidth: 160,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6, color: "#1f2937" }}>Legend</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <div style={{ width: 12, height: 12, background: "#3b82f6", borderRadius: "50%" }} />
          <span>Charging stations</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <div
            style={{
              width: 12,
              height: 12,
              background: "#9333ea",
              transform: "rotate(45deg)",
              border: "1px solid white",
            }}
          />
          <span>Council markers</span>
        </div>

        {/* NEW: connector color keys */}
        <div style={{ fontWeight: 600, color: "#1f2937", marginBottom: 4 }}>Connector types</div>
        {Object.entries(CONNECTOR_COLORS).map(([label, color]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: color as string }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <MapContainer /* ... unchanged props ... */ center={[54.5, -4]} zoom={6}
        style={{ position:"absolute", top:0, left:0, right:0, bottom:0, width:"100%", height:"100%" }}
        scrollWheelZoom={true}
        bounds={[[-8.649,49.823],[1.763,60.845]]}
      >
        <MapInitializer />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={process.env.NEXT_PUBLIC_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
          maxZoom={19}
        />
        {/* viewport fetcher / layers unchanged */}
        {/* ... */}
        <CouncilMarkerLayer showCouncil={showCouncil} onMarkerClick={handleStationClick} />
        {/* ... */}
      </MapContainer>

      <StationDrawer
        station={activeStation}
        onClose={handleDrawerClose}
        onFeedbackSubmit={handleFeedbackSubmit}
      />

      <style jsx global>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
