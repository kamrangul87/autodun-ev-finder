"use client";

// This page renders an EV charging heatmap using the Model-1 scoring functions
// from `lib/model1.ts`. It fetches charging stations from the existing
// `/api/stations` and `/api/sites` endpoints and then computes a score for each
// station based on its total power, maximum power and number of
// connectors. Those scores are normalised and passed to a Leaflet heat
// layer to visualise the relative intensity of charging infrastructure
// across an area. Stations are also displayed as markers with a popup
// containing basic details and the raw score. A default view centres on
// London but you can adjust the latitude, longitude and radius by
// editing the query parameters in the URL (for example
// `?lat=53.48&lon=-2.24&dist=25` to focus on Manchester).

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
// Import scoring helpers directly from the lib; these are purely
// computational and safe to import on both server and client.  The
// relative path resolves to `project/lib/model1.ts`.
import { featuresFor, scoreFor, type OCMStation } from "../../lib/model1";

// Dynamically import leaflet components to avoid SSR issues.  The
// `ssr: false` option ensures they are only loaded on the client.
const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import("react-leaflet").then((m) => m.Popup),
  { ssr: false }
);

// `useMap` cannot be imported dynamically because it is a hook; importing it
// here is acceptable since it doesn't reference the `window` object itself.
import { useMap } from "react-leaflet";

import "leaflet/dist/leaflet.css";

// -----------------------------------------------------------------------------
// Feedback form component
function FeedbackForm({
  stationId,
  onSubmitted,
}: {
  stationId: number;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";
      await fetch(`${apiBase}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId, rating, comment }),
      });
      setSubmitted(true);
      onSubmitted();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };
  if (submitted) {
    return (
      <p style={{ color: "#22c55e", fontSize: "0.75rem", marginTop: "0.5rem" }}>
        Thank you for your feedback!
      </p>
    );
  }
  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "0.5rem" }}>
      <label
        style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}
      >
        Rating (0–5):
      </label>
      <select
        value={rating}
        onChange={(e) => setRating(parseInt(e.target.value, 10))}
        style={{
          padding: "0.25rem",
          fontSize: "0.75rem",
          border: "1px solid #374151",
          borderRadius: "0.25rem",
          background: "#1f2937",
          color: "#f9fafb",
          width: "100%",
          marginBottom: "0.25rem",
        }}
      >
        {[5, 4, 3, 2, 1, 0].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <label
        style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}
      >
        Comment:
      </label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment"
        style={{
          width: "100%",
          height: "3rem",
          padding: "0.25rem",
          fontSize: "0.75rem",
          border: "1px solid #374151",
          borderRadius: "0.25rem",
          background: "#0b1220",
          color: "#f9fafb",
          marginBottom: "0.25rem",
          resize: "vertical",
        }}
      />
      <button
        type="submit"
        disabled={submitting}
        style={{
          padding: "0.25rem 0.5rem",
          fontSize: "0.75rem",
          border: "1px solid #374151",
          borderRadius: "0.25rem",
          background: submitting ? "#374151" : "#1f2937",
          color: "#f9fafb",
          cursor: submitting ? "not-allowed" : "pointer",
          width: "100%",
        }}
      >
        Submit
      </button>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Type helpers

type HeatPoint = [number, number, number];

interface StationWithScore extends OCMStation {
  _score: number;
  StatusType?: {
    Title: string | null;
    IsOperational: boolean | null;
  };
  Feedback?: {
    count: number;
    averageRating: number | null;
    reliability: number | null;
  };
  DataSource?: string;
}

// -----------------------------------------------------------------------------
// HeatLayer component
function HeatLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();
  const layerRef = useRef<any>(null);
  useEffect(() => {
    let cancelled = false;
    async function mount() {
      if (cancelled) return;
      const L = (await import("leaflet")).default as any;
      await import("leaflet.heat");
      if (layerRef.current && map) {
        try {
          map.removeLayer(layerRef.current);
        } catch {
          /* ignore */
        }
        layerRef.current = null;
      }
      if (!map || points.length === 0) return;
      const layer = (L as any).heatLayer(points, {
        radius: 45,
        blur: 25,
        maxZoom: 17,
        max: 1.0,
        minOpacity: 0.35,
      });
      layer.addTo(map);
      layerRef.current = layer;
    }
    mount();
    return () => {
      cancelled = true;
      if (layerRef.current && map) {
        try {
          map.removeLayer(layerRef.current);
        } catch {
          /* ignore */
        }
        layerRef.current = null;
      }
    };
  }, [map, points]);
  return null;
}

// -----------------------------------------------------------------------------
// Helpers to normalise API responses into OCM POIs your scoring code expects

function toArray<T = unknown>(x: any): T[] {
  if (Array.isArray(x)) return x as T[];
  if (x && typeof x === "object") {
    return (x.sites || x.stations || x.data || x.out || x.items || []) as T[];
  }
  return [];
}

/** Convert simplified site objects into minimal OCMStation lookalikes */
function asOCMStations(rawItems: any[]): OCMStation[] {
  return rawItems
    .map((r, i) => {
      if (r && r.AddressInfo) return r as OCMStation;
      // simplified shape → lift to OCM-like
      const lat = typeof r?.lat === "number" ? r.lat : null;
      const lon = typeof r?.lon === "number" ? r.lon : null;
      if (lat == null || lon == null) return null;
      const name =
        r?.name ||
        r?.title ||
        r?.AddressInfo?.Title ||
        `EV charge point ${r?.id ?? i + 1}`;
      const connectors =
        typeof r?.connectors === "number" && r.connectors > 0
          ? r.connectors
          : 1;
      const maxPower = typeof r?.maxPowerKw === "number" ? r.maxPowerKw : 22;
      return {
        ID: (r?.id ?? r?.ID ?? 9000000 + i) as number,
        AddressInfo: {
          Title: name,
          AddressLine1: r?.addr || "",
          Town: r?.town || "",
          Postcode: r?.postcode || null,
          Latitude: lat,
          Longitude: lon,
        },
        Connections: Array.from({ length: connectors }).map(() => ({
          PowerKW: maxPower,
        })),
        StatusType: {
          Title:
            r?.status === "down"
              ? "Not Operational"
              : r?.StatusType?.Title || "Operational",
          IsOperational:
            typeof r?.status === "string"
              ? r.status !== "down"
              : (r?.StatusType?.IsOperational ?? true),
        },
        DataSource: r?.source === "council" ? "Council" : "OpenChargeMap",
      } as unknown as OCMStation;
    })
    .filter(Boolean) as OCMStation[];
}

// -----------------------------------------------------------------------------
// Main page component

export default function Model1HeatmapPage() {
  // Read optional query parameters for lat/lon/dist from window.location.
  const [params] = useState(() => {
    if (typeof window === "undefined") {
      return { lat: 51.5074, lon: -0.1278, dist: 25 };
    }
    const sp = new URLSearchParams(window.location.search);
    const lat = parseFloat(sp.get("lat") || "51.5074");
    const lon = parseFloat(sp.get("lon") || "-0.1278");
    const dist = parseFloat(sp.get("dist") || "25");
    return {
      lat: Number.isFinite(lat) ? lat : 51.5074,
      lon: Number.isFinite(lon) ? lon : -0.1278,
      dist: Number.isFinite(dist) ? dist : 25,
    };
  });

  const [stations, setStations] = useState<StationWithScore[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [bounds, setBounds] = useState<{
    north: number;
    south: number;
    east: number;
    west: number;
  } | null>(null);

  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [connFilter, setConnFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [feedbackOpenId, setFeedbackOpenId] = useState<number | null>(null);
  const [feedbackVersion, setFeedbackVersion] = useState<number>(0);

  // Fetch stations whenever dependencies change
  useEffect(() => {
    async function fetchStations() {
      setLoading(true);
      setError(null);
      try {
        let url = "";
        const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";
        if (bounds) {
          const { north, south, east, west } = bounds;
          url = `${apiBase}/api/sites?bbox=${west},${south},${east},${north}`;
        } else {
          // centre-based fallback
          url = `${apiBase}/api/stations?lat=${params.lat}&lon=${params.lon}&dist=${params.dist}`;
        }
        if (connFilter) url += `&conn=${encodeURIComponent(connFilter)}`;
        if (sourceFilter && sourceFilter !== "all") {
          url += `&source=${encodeURIComponent(sourceFilter)}`;
        }

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`API responded with ${res.status}`);
        const json = await res.json();

        // normalise any shape → OCM POIs
        const rawArray = toArray(json);
        const ocms: OCMStation[] = asOCMStations(rawArray);

        // Compute scores and filter out stations with missing coordinates
        const scored: StationWithScore[] = ocms
          .map((s) => {
            const lat = s?.AddressInfo?.Latitude;
            const lon = s?.AddressInfo?.Longitude;
            if (typeof lat !== "number" || typeof lon !== "number") return null;
            const f = featuresFor(s);
            const sc = scoreFor(f);
            return Object.assign({}, s, { _score: sc });
          })
          .filter(Boolean) as StationWithScore[];

        setStations(scored);
      } catch (e: any) {
        console.error("Stations fetch failed:", e);
        setError(e?.message || "Failed to load stations");
        setStations([]);
      } finally {
        setLoading(false);
      }
    }
    fetchStations();
  }, [
    bounds,
    params.lat,
    params.lon,
    params.dist,
    connFilter,
    sourceFilter,
    feedbackVersion,
  ]);

  // Prepare heat points by normalising the scores to [0,1]
  const heatPoints: HeatPoint[] = useMemo(() => {
    if (!stations.length) return [];
    const values = stations.map((s) => s._score);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const denom = max - min || 1;
    return stations.map((s) => {
      const lat = s.AddressInfo?.Latitude as number;
      const lon = s.AddressInfo?.Longitude as number;
      const w = (s._score - min) / denom;
      return [lat, lon, w] as HeatPoint;
    });
  }, [stations]);

  // Map reference
  const mapRef = useRef<any>(null);

  // Precreate marker icons
  const [operationalIcon, offlineIcon] = useMemo(() => {
    if (typeof window === "undefined") return [undefined, undefined];
    const L = require("leaflet");
    const ops = L.divIcon({
      html:
        '<div style="width: 14px; height: 14px; background: #22c55e; border-radius: 50%; border: 2px solid #ffffff;"></div>',
      iconSize: [18, 18],
      className: "",
    });
    const off = L.divIcon({
      html:
        '<div style="width: 14px; height: 14px; background: #ef4444; border-radius: 50%; border: 2px solid #ffffff;"></div>',
      iconSize: [18, 18],
      className: "",
    });
    return [ops, off];
  }, []);

  // Track and update map bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const b = map.getBounds?.();
      if (!b) return;
      setBounds({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    };
    update();
    map.on?.("moveend", update);
    map.on?.("zoomend", update);
    return () => {
      map.off?.("moveend", update);
      map.off?.("zoomend", update);
    };
  }, [mapRef]);

  const mapCenter: [number, number] = [params.lat, params.lon];

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      {/* Header with controls */}
      <div
        style={{
          position: "absolute",
          top: "0.5rem",
          left: "0.5rem",
          zIndex: 1000,
          background: "rgba(12, 19, 38, 0.9)",
          padding: "0.75rem",
          borderRadius: "0.25rem",
          color: "#f9fafb",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
          Autodun EV Map
        </h1>
        <p style={{ margin: 0, fontSize: "0.75rem", color: "#9ca3af" }}>
          Explore EV hotspots &amp; charging insights
        </p>
        <div
          style={{
            marginTop: "0.5rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <button
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition((pos) => {
                const { latitude, longitude } = pos.coords;
                if (mapRef.current) {
                  mapRef.current.setView([latitude, longitude], 13);
                }
              });
            }}
            style={{
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              border: "1px solid #374151",
              borderRadius: "0.25rem",
              background: "#1f2937",
              color: "#f9fafb",
              cursor: "pointer",
            }}
          >
            Use my location
          </button>
          <button
            onClick={() => {
              if (mapRef.current) {
                mapRef.current.setView(mapCenter, 13);
              }
            }}
            style={{
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              border: "1px solid #374151",
              borderRadius: "0.25rem",
              background: "#1f2937",
              color: "#f9fafb",
              cursor: "pointer",
            }}
          >
            Reset view
          </button>
          {/* Connector filter */}
          <select
            value={connFilter}
            onChange={(e) => setConnFilter(e.target.value)}
            style={{
              padding: "0.25rem",
              fontSize: "0.75rem",
              border: "1px solid #374151",
              borderRadius: "0.25rem",
              background: "#1f2937",
              color: "#f9fafb",
            }}
          >
            <option value="">All connectors</option>
            <option value="ccs">CCS</option>
            <option value="type 2">Type 2</option>
            <option value="chademo">CHAdeMO</option>
          </select>
          {/* Data source filter */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={{
              padding: "0.25rem",
              fontSize: "0.75rem",
              border: "1px solid #374151",
              borderRadius: "0.25rem",
              background: "#1f2937",
              color: "#f9fafb",
            }}
          >
            <option value="all">All sources</option>
            <option value="ocm">OpenChargeMap</option>
            <option value="council">Council</option>
          </select>
          {/* Toggle heatmap/markers */}
          <button
            onClick={() => setShowHeatmap((v) => !v)}
            style={{
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              border: "1px solid #374151",
              borderRadius: "0.25rem",
              background: "#1f2937",
              color: "#f9fafb",
              cursor: "pointer",
            }}
          >
            {showHeatmap ? "Markers" : "Heatmap"}
          </button>
        </div>
      </div>
      {/* Map container */}
      <main style={{ height: "100%", width: "100%" }}>
        <MapContainer
          center={mapCenter}
          zoom={13}
          scrollWheelZoom
          ref={mapRef}
          style={{ height: "100%", width: "100%" }}
          whenCreated={(map) => {
            mapRef.current = map;
          }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {/* Heat layer (rendered only when heatmap view is enabled) */}
          {showHeatmap && heatPoints.length > 0 && (
            <HeatLayer points={heatPoints} />
          )}
          {/* Marker layer (rendered only when heatmap view is disabled) */}
          {!showHeatmap &&
            stations.map((s, idx) => {
              const lat = s.AddressInfo?.Latitude as number;
              const lon = s.AddressInfo?.Longitude as number;
              const isOperational =
                typeof s.StatusType?.IsOperational === "boolean"
                  ? s.StatusType?.IsOperational
                  : null;
              return (
                <Marker
                  key={idx}
                  position={[lat, lon]}
                  icon={
                    isOperational === null
                      ? undefined
                      : isOperational
                      ? operationalIcon
                      : offlineIcon
                  }
                >
                  <Popup>
                    <strong>{s.AddressInfo?.Title || "Unnamed Station"}</strong>
                    <br />
                    {s.AddressInfo?.AddressLine1 || ""}
                    {s.AddressInfo?.Town ? `, ${s.AddressInfo.Town}` : ""}
                    {s.AddressInfo?.Postcode ? ` ${s.AddressInfo.Postcode}` : ""}
                    <br />
                    Score: {s._score.toFixed(2)}
                    {s.DataSource && (
                      <>
                        <br />
                        Source:{" "}
                        {s.DataSource === "Council" ? "Council data" : "OpenChargeMap"}
                      </>
                    )}
                    {s.StatusType?.Title && (
                      <>
                        <br />
                        Status: {s.StatusType.Title}
                        {typeof s.StatusType.IsOperational === "boolean" &&
                          (s.StatusType.IsOperational
                            ? " (Operational)"
                            : " (Not Operational)")}
                      </>
                    )}
                    {s.Feedback && s.Feedback.reliability != null && (
                      <>
                        <br />
                        Reliability:{" "}
                        {(s.Feedback.reliability * 100).toFixed(0)}% (
                        {s.Feedback.count} feedback)
                      </>
                    )}
                    <div style={{ marginTop: "0.5rem" }}>
                      {feedbackOpenId === (s as any).ID ? (
                        <FeedbackForm
                          stationId={(s as any).ID as number}
                          onSubmitted={() => {
                            setFeedbackVersion((v) => v + 1);
                            setFeedbackOpenId(null);
                          }}
                        />
                      ) : (
                        <button
                          onClick={() => setFeedbackOpenId((s as any).ID as number)}
                          style={{
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.75rem",
                            border: "1px solid #374151",
                            borderRadius: "0.25rem",
                            background: "#1f2937",
                            color: "#f9fafb",
                            cursor: "pointer",
                          }}
                        >
                          Leave feedback
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
        </MapContainer>

        {/* Heatmap legend */}
        {showHeatmap && (
          <div
            style={{
              position: "absolute",
              bottom: "1rem",
              left: "1rem",
              padding: "0.5rem",
              background: "rgba(0,0,0,0.6)",
              borderRadius: "0.25rem",
              color: "#f9fafb",
              fontSize: "0.75rem",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                width: "160px",
                height: "10px",
                background:
                  "linear-gradient(to right, rgba(42,133,255,1) 0%, rgba(110,216,89,1) 25%, rgba(255,255,0,1) 50%, rgba(255,128,0,1) 75%, rgba(255,0,0,1) 100%)",
                marginBottom: "0.25rem",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              padding: "1rem",
              background: "rgba(0,0,0,0.8)",
              borderRadius: "0.5rem",
              color: "#f9fafb",
              fontSize: "0.875rem",
              zIndex: 1000,
              textAlign: "center",
              maxWidth: "80%",
              border: "1px solid #ef4444",
            }}
          >
            Failed to load stations: {error}
          </div>
        )}

        {/* Empty state overlay */}
        {!loading && !error && stations.length === 0 && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              padding: "1rem",
              background: "rgba(0,0,0,0.7)",
              borderRadius: "0.5rem",
              color: "#f9fafb",
              fontSize: "0.875rem",
              zIndex: 1000,
              textAlign: "center",
              maxWidth: "80%",
            }}
          >
            No stations found in this area. Try zooming out or moving the map.
          </div>
        )}
      </main>
    </div>
  );
}
