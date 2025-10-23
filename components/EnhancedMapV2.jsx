// components/EnhancedMapV2.jsx
"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";

import StationDrawer from "./StationDrawer"; // drawer handles council vs normal
import { LocateMeButton } from "./LocateMeButton.tsx";
import { getCached, setCache } from "../lib/api-cache";
import { telemetry } from "../utils/telemetry.ts";
import { findNearestStation } from "../utils/haversine.ts";
import { CONNECTOR_COLORS } from "../lib/connectorCatalog";

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

/* ─────────────── Connector filter helpers (robust OCM) ─────────────── */

const ID_TO_LABEL = {
  33: "CCS", // IEC 62196-3 Type 2 Combo
  32: "CCS", // IEC 62196-3 Type 1 Combo → CCS bucket
  2: "CHAdeMO",
  25: "Type 2",
};

const canonicalize = (raw) => {
  if (!raw || typeof raw !== "string") return "Unknown";
  const t = raw.toLowerCase();
  if (t.includes("ccs") || t.includes("combo")) return "CCS";
  if (t.includes("chademo")) return "CHAdeMO";
  if (
    t.includes("type 2") ||
    t.includes("type-2") ||
    (t.includes("iec 62196") && t.includes("type 2")) ||
    t.includes("mennekes")
  )
    return "Type 2";
  return raw.trim();
};

const num = (v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(+v)) return +v;
  return undefined;
};

function coerceArray(maybeArr) {
  if (Array.isArray(maybeArr)) return maybeArr;
  if (typeof maybeArr === "string") {
    try {
      const parsed = JSON.parse(maybeArr);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function extractConnectorLabels(station) {
  // 0) already-normalized
  if (Array.isArray(station?.connectors) && station.connectors.length) {
    return Array.from(
      new Set(
        station.connectors
          .map((c) => canonicalize(c?.type))
          .filter((s) => s && s !== "Unknown")
      )
    );
  }

  // 1) most common array homes
  const arrays = [
    station?.Connections,
    station?.connections,
    station?.properties?.Connections,
    station?.properties?.connections,
    station?.ConnectionsJSON, // sometimes stringified
  ];
  for (const arr of arrays) {
    const items = coerceArray(arr);
    if (items.length) {
      const labels = [];
      for (const c of items) {
        // Prefer ID (present in many tiles)
        const id =
          num(c?.ConnectionTypeID) ??
          num(c?.connectionTypeId) ??
          num(c?.ConnectionType?.ID);
        if (id !== undefined && ID_TO_LABEL[id]) {
          labels.push(ID_TO_LABEL[id]);
          continue;
        }
        // Else try titles/fallbacks
        const title =
          c?.type ??
          c?.ConnectionType?.Title ??
          c?.ConnectionType?.FormalName ??
          c?.CurrentType?.Title ??
          c?.Level?.Title ??
          "";
        const lab = canonicalize(title);
        if (lab !== "Unknown") labels.push(lab);
      }
      if (labels.length) return Array.from(new Set(labels));
    }
  }

  // 2) top-level hints
  const topId =
    num(station?.ConnectionTypeID) ??
    num(station?.connectionTypeId) ??
    num(station?.ConnectionType?.ID);
  if (topId !== undefined && ID_TO_LABEL[topId]) return [ID_TO_LABEL[topId]];

  const topTitle =
    station?.ConnectionType ??
    station?.connectionType ??
    station?.properties?.ConnectionType ??
    station?.properties?.connectionType;
  if (typeof topTitle === "string") {
    const lab = canonicalize(topTitle);
    if (lab !== "Unknown") return [lab];
  }

  // 3) ad-hoc summary labels
  const maybeLabels =
    station?.connectorLabels ||
    station?.properties?.connectorLabels ||
    station?.labels;
  if (Array.isArray(maybeLabels) && maybeLabels.length) {
    return Array.from(
      new Set(maybeLabels.map(canonicalize).filter((x) => x && x !== "Unknown"))
    );
  }

  // nothing found
  return [];
}

/**
 * FINAL behavior:
 * - All three on  → show everything (including unknown).
 * - Some subset   → show stations that declare a selected type; HIDE unknown.
 * - All off       → show nothing.
 */
function stationMatchesFilter(station, filter) {
  const anyOn = filter.type2 || filter.ccs || filter.chademo;
  const allOn = filter.type2 && filter.ccs && filter.chademo;
  if (!anyOn) return false;
  if (allOn) return true;

  const labels = extractConnectorLabels(station);
  if (!labels || labels.length === 0) return false; // hide unknown when subset chosen

  const s = new Set(labels);
  return (
    (filter.type2 && s.has("Type 2")) ||
    (filter.ccs && s.has("CCS")) ||
    (filter.chademo && s.has("CHAdeMO"))
  );
}
/* ─────────────── end helpers ─────────────── */

function MapInitializer() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function HeatmapLayer({ stations, intensity = 1 }) {
  const map = useMap();
  const heatLayerRef = useRef(null);
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const updateZoom = () => setZoom(map.getZoom());
    map.on("zoomend", updateZoom);
    return () => map.off("zoomend", updateZoom);
  }, [map]);

  useEffect(() => {
    if (!map || !stations || stations.length === 0) {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      return;
    }

    import("leaflet.heat").then(() => {
      if (heatLayerRef.current) map.removeLayer(heatLayerRef.current);

      const currentZoom = map.getZoom();
      const radius = Math.max(12, Math.min(35, 35 - (currentZoom - 10) * 2.3));

      let processedStations = stations;
      if (stations.length > 25000) {
        processedStations = stations.filter((_, idx) => idx % 3 === 0);
        console.log(
          `[HeatmapLayer] Downsampled ${stations.length} to ${processedStations.length} points for performance`
        );
      }

      const sumQty = (arr) =>
        arr.reduce(
          (sum, c) => sum + (typeof c?.quantity === "number" ? c.quantity : 1),
          0
        );

      const maxIntensity = Math.max(
        ...processedStations.map((s) =>
          Array.isArray(s.connectors) && s.connectors.length
            ? sumQty(s.connectors)
            : 1
        )
      );

      const heatData = processedStations.map((s) => {
        const weight =
          Array.isArray(s.connectors) && s.connectors.length
            ? sumQty(s.connectors)
            : 1;
        return [s.lat, s.lng, (weight / maxIntensity) * intensity];
      });

      // @ts-ignore
      heatLayerRef.current = L.heatLayer(heatData, {
        radius,
        blur: 15,
        maxZoom: 17,
        max: 1.0,
        gradient: { 0.0: "green", 0.4: "yellow", 0.7: "orange", 1.0: "red" },
      }).addTo(map);
    });

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [map, stations, intensity, zoom]);

  return null;
}

function StationMarker({ station, onClick }) {
  return (
    <Marker
      position={[station.lat, station.lng]}
      eventHandlers={{ click: () => onClick(station) }}
    />
  );
}

/* ---------- Helpers just for Council layer ---------- */
const ci = (v) => (typeof v === "string" ? v.toLowerCase() : v);

function findPostcode(obj) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const [k, v] of Object.entries(obj)) {
    const key = ci(k) || "";
    if (
      key.includes("postcode") ||
      key === "post code" ||
      key.includes("postalcode") ||
      key.includes("post_code") ||
      key.includes("zip")
    ) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    if (v && typeof v === "object") {
      const deep = findPostcode(v);
      if (deep) return deep;
    }
  }
  return undefined;
}

function findTown(obj) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const [k, v] of Object.entries(obj)) {
    const key = ci(k) || "";
    if (key === "town" || key === "city" || key.includes("locality")) {
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    if (v && typeof v === "object") {
      const deep = findTown(v);
      if (deep) return deep;
    }
  }
  return undefined;
}

function CouncilMarkerLayer({ showCouncil, onMarkerClick }) {
  const map = useMap();
  const [councilStations, setCouncilStations] = useState([]);
  const fetchTimeoutRef = useRef(null);
  const lastBboxRef = useRef(null);

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
      if (response.ok && data?.features) {
        const items = data.features.map((f) => {
          const p = f.properties || {};
          const ai = p.AddressInfo || {};

          const name =
            p.title ||
            ai.Title ||
            p.AddressLine1 ||
            ai.AddressLine1 ||
            "Unknown location";
          const addressLine =
            p.AddressLine1 || ai.AddressLine1 || p.address || ai.Title || undefined;

          const town = findTown({ ...p, ...ai });
          const postcode =
            findPostcode({ ...p, ...ai, PostCode: ai?.PostCode }) ||
            (typeof ai.Title === "string" &&
              ai.Title.match(/[A-Z]{1,2}\d[\dA-Z]?\s*\d[A-Z]{2}/)?.[0]) ||
            (typeof p.title === "string" &&
              p.title.match(/[A-Z]{1,2}\d[\dA-Z]?\s*\d[A-Z]{2}/)?.[0]) ||
            undefined;

          const qty =
            typeof p.NumberOfPoints === "number" && p.NumberOfPoints > 0
              ? p.NumberOfPoints
              : 1;

          const connectors = [
            {
              type: "Type 2",
              quantity: qty,
            },
          ];

          return {
            id: Number(p.id),
            name,
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
            address: [addressLine || name, town, postcode]
              .filter(Boolean)
              .join(", "),
            town,
            postcode,
            connectors,
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

function UserLocationMarker({ location, accuracy }) {
  if (!location) return null;
  return (
    <>
      <Circle
        center={[location.lat, location.lng]}
        radius={accuracy || 100}
        pathOptions={{
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.1,
          weight: 1,
        }}
      />
      <Marker position={[location.lat, location.lng]} icon={userLocationIcon} />
    </>
  );
}

function ViewportFetcher({
  onFetchStations,
  onLoadingChange,
  searchResult,
  shouldZoomToData,
  stations,
}) {
  const map = useMap();
  const fetchTimeoutRef = useRef(null);
  const lastFetchRef = useRef(null);
  const isFirstFetchRef = useRef(true);

  const fetchForViewport = useCallback(
    async (isFirstLoad = false) => {
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const bboxStr = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
      if (lastFetchRef.current === bboxStr) return;

      const cacheKey = `bbox_${bboxStr}`;
      const cached = getCached(cacheKey);
      if (cached) {
        lastFetchRef.current = bboxStr;
        onFetchStations?.(cached);
        return;
      }

      try {
        onLoadingChange?.(true);
        const tiles = isFirstLoad ? 4 : 2;
        const limitPerTile = isFirstLoad ? 500 : 750;
        const url = `/api/stations?bbox=${bboxStr}&tiles=${tiles}&limitPerTile=${limitPerTile}`;
        const response = await fetch(url, { cache: "no-store" });
        const data = await response.json();
        if (response.ok) {
          const normalizedData = {
            items: data.features ? data.features.map((f) => f.properties) : [],
            count: data.count,
            source: data.source,
            bbox: data.bbox,
          };
          setCache(cacheKey, normalizedData);
          lastFetchRef.current = bboxStr;
          onFetchStations?.(normalizedData);
        } else {
          console.error("API error:", data.error || "Failed to fetch stations");
        }
      } catch (error) {
        console.error("Viewport fetch error:", error);
        lastFetchRef.current = null;
      } finally {
        onLoadingChange?.(false);
      }
    },
    [map, onFetchStations, onLoadingChange]
  );

  useMapEvents({
    moveend: () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => fetchForViewport(false), 400);
    },
  });

  useEffect(() => {
    if (isFirstFetchRef.current && stations && stations.length > 0) {
      const bboxStr = `-8.649,49.823,1.763,60.845`;
      lastFetchRef.current = bboxStr;
      isFirstFetchRef.current = false;
    }
  }, [map, stations]);

  useEffect(() => {
    if (searchResult) {
      map.setView([searchResult.lat, searchResult.lng], 13);
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => fetchForViewport(false), 500);
    }
  }, [map, searchResult, fetchForViewport]);

  useEffect(() => {
    if (shouldZoomToData && stations && stations.length > 0) {
      const bounds = L.latLngBounds(stations.map((s) => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, stations, shouldZoomToData]);

  return null;
}

function LocateMeControl({ onLocationChange, onError }) {
  const handleLocationFound = (lat, lng, accuracy) => {
    onLocationChange({ lat, lng }, accuracy);
  };
  return (
    <div
      className="leaflet-top leaflet-right"
      style={{ marginTop: "80px", marginRight: "10px" }}
    >
      <div className="leaflet-control">
        <LocateMeButton
          onLocationFound={handleLocationFound}
          onError={onError}
        />
      </div>
    </div>
  );
}

export default function EnhancedMap({
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
}) {
  const [activeStation, setActiveStation] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const mapRef = useRef(null);

  // connector filter
  const [filter, setFilter] = useState({ type2: true, ccs: true, chademo: true });

  const filteredStations = useMemo(() => {
    if (!Array.isArray(stations) || stations.length === 0) return stations;
    return stations.filter((s) => stationMatchesFilter(s, filter));
  }, [stations, filter]);

  useEffect(() => {
    if (externalUserLocation && mapRef.current) {
      setUserLocation(externalUserLocation);
      mapRef.current.setView(
        [externalUserLocation.lat, externalUserLocation.lng],
        Math.max(mapRef.current.getZoom(), 14)
      );
    }
  }, [externalUserLocation]);

  const handleStationClick = useCallback((station) => {
    setActiveStation(station);
    telemetry.drawerOpen(station.id, station.isCouncil || false);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setActiveStation(null);
  }, []);

  const handleFeedbackSubmit = useCallback(
    (stationId, vote, comment) => {
      onToast?.({ message: "✓ Thanks for your feedback!", type: "success" });
    },
    [onToast]
  );

  const handleLocationChange = useCallback(
    (location, accuracy) => {
      setUserLocation(location);
      setLocationAccuracy(accuracy);
      if (mapRef.current && location) {
        mapRef.current.setView([location.lat, location.lng], 14);
        const nearest = findNearestStation(location, stations);
        if (nearest) {
          console.log(
            `[Location] Nearest station: ${nearest.station.name} (${nearest.distance.toFixed(
              2
            )} km)`
          );
        }
      }
    },
    [stations]
  );

  const handleLocationError = useCallback(
    (error) => {
      onToast?.({ message: error, type: "error" });
    },
    [onToast]
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {isLoading && (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            left: "10px",
            zIndex: 1000,
            background: "white",
            padding: "6px 10px",
            borderRadius: "20px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <div
            style={{
              width: "14px",
              height: "14px",
              border: "2px solid #3b82f6",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.6s linear infinite",
            }}
          />
          <span style={{ fontSize: "11px", fontWeight: "500", color: "#374151" }}>
            Loading…
          </span>
        </div>
      )}

      {/* Right-side stacks: Filters + Legend */}
      <div
        style={{
          position: "absolute",
          bottom: "10px",
          right: "10px",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: 240,
        }}
      >
        {/* Filter */}
        <div
          style={{
            background: "white",
            padding: "8px",
            borderRadius: "8px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            fontSize: "11px",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6, color: "#1f2937" }}>
            Filter connectors
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={filter.ccs}
              onChange={(e) =>
                setFilter((f) => ({ ...f, ccs: e.target.checked }))
              }
            />
            <span>CCS</span>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={filter.chademo}
              onChange={(e) =>
                setFilter((f) => ({ ...f, chademo: e.target.checked }))
              }
            />
            <span>CHAdeMO</span>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={filter.type2}
              onChange={(e) =>
                setFilter((f) => ({ ...f, type2: e.target.checked }))
              }
            />
            <span>Type 2</span>
          </label>
        </div>

        {/* Legend */}
        <div
          style={{
            background: "white",
            padding: "8px",
            borderRadius: "8px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            fontSize: "11px",
            minWidth: 160,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6, color: "#1f2937" }}>
            Legend
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                background: "#3b82f6",
                borderRadius: "50%",
              }}
            />
            <span>Charging stations</span>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                background: "#9333ea",
                transform: "rotate(45deg)",
                border: "1px solid white",
              }}
            />
            <span>Council markers</span>
          </div>

          <div style={{ fontWeight: 600, color: "#1f2937", marginBottom: 4 }}>
            Connector types
          </div>
          {Object.entries(CONNECTOR_COLORS).map(([label, color]) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: String(color),
                }}
              />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <MapContainer
        ref={mapRef}
        center={[54.5, -4]}
        zoom={6}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
        }}
        scrollWheelZoom={true}
        bounds={[
          [-8.649, 49.823],
          [1.763, 60.845],
        ]}
      >
        <MapInitializer />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={
            process.env.NEXT_PUBLIC_TILE_URL ||
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
          maxZoom={19}
        />
        <ViewportFetcher
          onFetchStations={onFetchStations}
          onLoadingChange={onLoadingChange}
          searchResult={searchResult}
          shouldZoomToData={shouldZoomToData}
          stations={stations}
        />
        {showHeatmap && <HeatmapLayer stations={filteredStations} />}
        {showMarkers && (
          <MarkerClusterGroup chunkedLoading>
            {filteredStations.map((station) => (
              <StationMarker
                key={station.id}
                station={station}
                onClick={handleStationClick}
              />
            ))}
          </MarkerClusterGroup>
        )}
        <CouncilMarkerLayer
          showCouncil={showCouncil}
          onMarkerClick={handleStationClick}
        />
        <UserLocationMarker
          location={userLocation}
          accuracy={locationAccuracy}
        />
        <LocateMeControl
          onLocationChange={handleLocationChange}
          onError={handleLocationError}
        />
      </MapContainer>

      <StationDrawer
        station={activeStation}
        onClose={handleDrawerClose}
        onFeedbackSubmit={handleFeedbackSubmit}
      />

      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
