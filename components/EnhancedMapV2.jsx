// components/EnhancedMapV2.jsx
"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  LayerGroup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";

import StationDrawer from "./StationDrawer";
import { LocateMeButton } from "./LocateMeButton";
import { getCached, setCache } from "../lib/api-cache";
import { telemetry } from "../utils/telemetry";
import { findNearestStation } from "../utils/haversine";

/* ----------------- helpers ----------------- */
const toBool = (v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
  return false;
};

const isDesktopPointer = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  try {
    return window.matchMedia("(pointer:fine)").matches;
  } catch {
    return true;
  }
};

// Normalize bbox string to 4dp so equality checks are stable
const bboxStrFromBounds = (bounds) => {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const r = (n) => Number(n).toFixed(4);
  return `${r(sw.lng)},${r(sw.lat)},${r(ne.lng)},${r(ne.lat)}`;
};

/* ----------------- Leaflet defaults ----------------- */
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
  html: `
    <div style="
      width:16px;height:16px;
      background:#9333ea;
      transform:rotate(45deg);
      border:2px solid #fff;
      box-shadow:0 0 4px rgba(0,0,0,0.45);
    "></div>`,
  className: "",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const userLocationIcon = L.divIcon({
  html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 6px rgba(59,130,246,0.6)"></div>',
  className: "",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

/* ----------------- Small map helpers ----------------- */
function MapInitializer() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// Dedicated pane for council markers (above heat + normal markers)
function EnsureCouncilPane() {
  const map = useMap();
  useEffect(() => {
    const name = "council-pane";
    if (!map.getPane(name)) {
      const pane = map.createPane(name);
      // Default panes: overlay 400, marker 600, tooltip 650, popup 700
      pane.style.zIndex = "700"; // safely above heatmap/markers
      pane.style.pointerEvents = "auto";
    }
  }, [map]);
  return null;
}

/* ----------------- Heatmap Layer (unchanged) ----------------- */
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

/* ----------------- Station marker (unchanged) ----------------- */
function StationMarker({ station, onClick }) {
  return (
    <Marker
      position={[station.lat, station.lng]}
      eventHandlers={{ click: () => onClick(station) }}
    />
  );
}

/* ----------------- Council layer: desktop hardened ----------------- */
function CouncilMarkerLayer({ showCouncil, onMarkerClick }) {
  const map = useMap();
  const [councilStations, setCouncilStations] = useState([]);

  const showCouncilBool = toBool(showCouncil);
  const isDesktop = useMemo(() => isDesktopPointer(), []);

  // request coordination
  const debounceTimer = useRef(null);
  /** @type {React.MutableRefObject<AbortController|null>} */
  const inflight = useRef(null);
  /** @type {React.MutableRefObject<string|null>} */
  const lastBboxRef = useRef(null);
  /** @type {React.MutableRefObject<string|null>} */
  const desiredBboxRef = useRef(null);
  const lastFetchTsRef = useRef(0);

  const MIN_INTERVAL_MS = 1200; // throttle to avoid backend 500s
  const DEBOUNCE_MS = 400;

  const doFetch = useCallback(
    async (reason) => {
      if (!showCouncilBool) return;

      // throttle
      const now = Date.now();
      if (now - lastFetchTsRef.current < MIN_INTERVAL_MS) {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(
          () => doFetch("throttled"),
          MIN_INTERVAL_MS
        );
        return;
      }

      const bounds = map.getBounds();
      const bboxStr = bboxStrFromBounds(bounds);
      desiredBboxRef.current = bboxStr;

      if (lastBboxRef.current === bboxStr) return; // already fetched this bbox

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(async () => {
        const finalBbox = desiredBboxRef.current;

        // abort any in-flight request
        if (inflight.current) inflight.current.abort();
        const ac = new AbortController();
        inflight.current = ac;

        lastFetchTsRef.current = Date.now();

        const cacheKey = `council_${finalBbox}`;
        const cached = getCached(cacheKey);
        if (cached) {
          setCouncilStations(cached.items || []);
          lastBboxRef.current = finalBbox;
          inflight.current = null;
          return;
        }

        try {
          const res = await fetch(`/api/council-stations?bbox=${finalBbox}`, {
            cache: "no-store",
            signal: ac.signal,
          });
          if (!res.ok) {
            // mark this bbox as attempted to prevent hot-loop; don't spam
            lastBboxRef.current = finalBbox;
            inflight.current = null;
            return;
          }
          const data = await res.json();
          const items =
            data?.features?.map((f) => ({
              id: Number(f.properties.id),
              name: f.properties.title || f.properties.AddressInfo?.Title,
              lat: f.geometry.coordinates[1],
              lng: f.geometry.coordinates[0],
              address: f.properties.AddressInfo?.AddressLine1,
              postcode: f.properties.AddressInfo?.Postcode,
              connectors: [
                {
                  type: "Unknown",
                  quantity:
                    typeof f.properties.NumberOfPoints === "number"
                      ? f.properties.NumberOfPoints
                      : 1,
                },
              ],
              isCouncil: true,
            })) ?? [];

          setCouncilStations(items);
          setCache(cacheKey, { items, count: items.length });
          lastBboxRef.current = finalBbox;
          inflight.current = null;
          telemetry.councilSelected("viewport", items.length);
        } catch (err) {
          // aborted or failed: mark and stop, but don't spam server
          lastBboxRef.current = finalBbox;
          inflight.current = null;
        }
      }, DEBOUNCE_MS);
    },
    [map, showCouncilBool]
  );

  // initial fetch when map ready + on toggle on
  useEffect(() => {
    if (!showCouncilBool) {
      setCouncilStations([]);
      return;
    }
    map.whenReady(() => doFetch("ready"));
    doFetch("mount"); // kick once immediately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, showCouncilBool]);

  // viewport events → coalesced fetch
  useMapEvents({
    moveend: () => doFetch("moveend"),
    zoomend: () => doFetch("zoomend"),
    load: () => doFetch("load"),
  });

  if (!showCouncilBool || councilStations.length === 0) return null;

  // DESKTOP: render markers directly (no cluster)
  if (isDesktop) {
    return (
      <LayerGroup pane="council-pane" key={`council-desktop-${councilStations.length}`}>
        {councilStations.map((station) => (
          <Marker
            key={`council-${station.id}`}
            position={[station.lat, station.lng]}
            icon={councilIcon}
            pane="council-pane"
            zIndexOffset={1000}
            eventHandlers={{ click: () => onMarkerClick(station) }}
          />
        ))}
      </LayerGroup>
    );
  }

  // MOBILE: clustered
  return (
    <MarkerClusterGroup
      chunkedLoading
      pane="council-pane"
      key={`council-mobile-${councilStations.length}`}
      disableClusteringAtZoom={13}
    >
      {councilStations.map((station) => (
        <Marker
          key={`council-${station.id}`}
          position={[station.lat, station.lng]}
          icon={councilIcon}
          pane="council-pane"
          zIndexOffset={1000}
          eventHandlers={{ click: () => onMarkerClick(station) }}
        />
      ))}
    </MarkerClusterGroup>
  );
}

/* ----------------- User location (unchanged) ----------------- */
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

/* ----------------- Station viewport fetcher (bbox normalized) ----------------- */
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
      const bboxStr = bboxStrFromBounds(bounds);
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
        /* eslint-disable no-labels */ thelimit: {}
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
      const bboxStr = `-8.6490,49.8230,1.7630,60.8450`; // normalized UK bounds
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

/* ----------------- Locate Me control (unchanged) ----------------- */
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
        <LocateMeButton onLocationFound={handleLocationFound} onError={onError} />
      </div>
    </div>
  );
}

/* ----------------- Main map ----------------- */
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

  const showCouncilBool = toBool(showCouncil);

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
      // TODO: post to /api/feedback if needed
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

      <div
        style={{
          position: "absolute",
          bottom: "10px",
          right: "10px",
          zIndex: 1000,
          background: "white",
          padding: "8px",
          borderRadius: "6px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          fontSize: "11px",
        }}
      >
        <div style={{ fontWeight: "600", marginBottom: "6px", color: "#1f2937" }}>
          Legend
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}
        >
          <div
            style={{ width: "12px", height: "12px", background: "#3b82f6", borderRadius: "50%" }}
          ></div>
          <span>Charging stations</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div
            style={{
              width: "12px",
              height: "12px",
              background: "#9333ea",
              transform: "rotate(45deg)",
              border: "1px solid white",
            }}
          ></div>
          <span>Council markers</span>
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
        <EnsureCouncilPane />
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
        {showHeatmap && <HeatmapLayer stations={stations} />}
        {showMarkers && (
          <MarkerClusterGroup chunkedLoading>
            {stations.map((station) => (
              <StationMarker
                key={station.id}
                station={station}
                onClick={handleStationClick}
              />
            ))}
          </MarkerClusterGroup>
        )}
        <CouncilMarkerLayer
          showCouncil={showCouncilBool}
          onMarkerClick={handleStationClick}
        />
        <UserLocationMarker location={userLocation} accuracy={locationAccuracy} />
        <LocateMeControl
          onLocationChange={handleLocationChange}
          onError={handleLocationError}
        />
      </MapContainer>

      {/* Drawer floats; map stays interactive outside it */}
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
