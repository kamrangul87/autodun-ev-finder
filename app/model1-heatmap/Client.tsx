"use client";

/**
 * Autodun EV Map (client component)
 * - Debounced bbox updates (prevents API spam)
 * - Race-proof network (AbortController + latest-request-wins)
 * - Heatmap + Markers together, with heat in a non-interactive pane UNDER markers
 * - Stable popups: stop click/scroll propagation so forms don’t close
 * - Heatmap opacity slider
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { featuresFor, scoreFor, type OCMStation } from "../../lib/model1";

// ---- request coordination (module-level) -----------------------------------
let lastReqId = 0;
let lastController: AbortController | null = null;

// ---- debounce helper (module-level) ----------------------------------------
const debounce = <F extends (...a: any[]) => void>(fn: F, ms = 450) => {
  let t: any;
  return (...args: Parameters<F>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

// ---- react-leaflet components (client-only) --------------------------------
const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import("react-leaflet").then((m) => m.CircleMarker),
  { ssr: false }
);
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), {
  ssr: false,
});

// hooks (safe in client file)
import { useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// ---------------------------------------------------------------------------
// Feedback form – propagation blocked so popup stays open while typing/clicking
function FeedbackForm({
  stationId,
  onSubmitted,
}: {
  stationId: number;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";
      const res = await fetch(`${apiBase}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId, rating, comment }),
      });
      if (!res.ok) throw new Error(`Feedback API ${res.status}`);
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
    <form
      onSubmit={handleSubmit}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{ marginTop: "0.5rem" }}
    >
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

// ---------------------------------------------------------------------------
// Types
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

// ---------------------------------------------------------------------------
// Heat layer (in dedicated 'heat' pane)
function HeatLayer({ points, opacity }: { points: HeatPoint[]; opacity: number }) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      if (cancelled) return;
      const L = (await import("leaflet")).default as any;
      await import("leaflet.heat");

      if (layerRef.current && map) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
      if (!map || points.length === 0) return;

      const layer = (L as any).heatLayer(points, {
        radius: 45,
        blur: 25,
        maxZoom: 17,
        max: 1.0,
        minOpacity: opacity,
        pane: "heat", // ensure the layer uses our non-interactive pane
      });
      layer.addTo(map);
      layerRef.current = layer;
    }

    try {
      mount();
    } catch (e) {
      console.error("Heat layer mount failed:", e);
    }
    return () => {
      cancelled = true;
      if (layerRef.current && map) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
    };
  }, [map, points, opacity]);

  return null;
}

// ---------------------------------------------------------------------------
// Component
export default function Client() {
  // Read query params lazily (client only)
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bounds, setBounds] = useState<{
    north: number;
    south: number;
    east: number;
    west: number;
  } | null>(null);

  // layer controls
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [heatOpacity, setHeatOpacity] = useState(0.65);

  // filters
  const [connFilter, setConnFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"ocm" | "all" | "council">("ocm");

  // feedback
  const [feedbackOpenId, setFeedbackOpenId] = useState<number | null>(null);
  const [feedbackVersion, setFeedbackVersion] = useState(0);

  // Fetch stations (race-proofed + debounced bbox)
  useEffect(() => {
    async function fetchStations() {
      setLoading(true);
      setError(null);

      const reqId = ++lastReqId;
      if (lastController) lastController.abort();
      const controller = new AbortController();
      lastController = controller;

      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";
        let url = "";
        if (bounds) {
          const { north, south, east, west } = bounds;
          url = `${apiBase}/api/stations?north=${north}&south=${south}&east=${east}&west=${west}`;
        } else {
          url = `${apiBase}/api/stations?lat=${params.lat}&lon=${params.lon}&dist=${params.dist}`;
        }
        if (connFilter) url += `&conn=${encodeURIComponent(connFilter)}`;
        if (sourceFilter && sourceFilter !== "all") {
          url += `&source=${encodeURIComponent(sourceFilter)}`;
        } else if (sourceFilter === "all") {
          url += `&source=all`;
        }

        const res = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error(`API responded with ${res.status}`);

        const json = await res.json();
        let data: OCMStation[] = Array.isArray(json)
          ? json
          : Array.isArray(json?.items)
          ? json.items
          : [];

        if (!Array.isArray(json) && json?.error) setError(String(json.error));

        const scored: StationWithScore[] = (data ?? [])
          .map((s) => {
            const lat = s?.AddressInfo?.Latitude;
            const lon = s?.AddressInfo?.Longitude;
            if (typeof lat !== "number" || typeof lon !== "number") return null;
            const f = featuresFor(s);
            const sc = scoreFor(f);
            return { ...(s as any), _score: sc } as StationWithScore;
          })
          .filter(Boolean) as StationWithScore[];

        if (reqId === lastReqId) setStations(scored);
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(e?.message || "Failed to load stations");
      } finally {
        if (reqId === lastReqId) setLoading(false);
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

  // Heat points
  const heatPoints: HeatPoint[] = useMemo(() => {
    if (!stations.length) return [];
    const vals = stations.map((s) => s._score);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const denom = max - min || 1;
    return stations.map((s) => {
      const lat = s.AddressInfo!.Latitude as number;
      const lon = s.AddressInfo!.Longitude as number;
      const w = (s._score - min) / denom;
      return [lat, lon, w] as HeatPoint;
    });
  }, [stations]);

  // Map ref + panes + debounced bounds tracking
  const mapRef = useRef<any>(null);

  // Create panes once: heat under markers and non-interactive
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!map.getPane("heat")) map.createPane("heat");
    const heatPane = map.getPane("heat");
    if (heatPane) {
      heatPane.style.zIndex = "399";
      heatPane.style.pointerEvents = "none"; // clicks pass through
    }

    if (!map.getPane("markers")) map.createPane("markers");
    const markerPane = map.getPane("markers");
    if (markerPane) markerPane.style.zIndex = "401";
  }, []);

  // Debounced bounds tracker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const debouncedUpdate = debounce(() => {
      const b = map.getBounds?.();
      if (!b) return;
      setBounds({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    }, 450);

    debouncedUpdate(); // initial
    map.on?.("moveend", debouncedUpdate);
    map.on?.("zoomend", debouncedUpdate);
    return () => {
      map.off?.("moveend", debouncedUpdate);
      map.off?.("zoomend", debouncedUpdate);
    };
  }, []);

  const mapCenter: [number, number] = [params.lat, params.lon];

  // -------------------------------------------------------------------------
  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      {/* Header / Controls */}
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
            alignItems: "center",
          }}
        >
          <button
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition((pos) => {
                const { latitude, longitude } = pos.coords;
                mapRef.current?.setView([latitude, longitude], 13);
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
              mapRef.current?.setView(mapCenter, 13);
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

          {/* Connectors */}
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

          {/* Source filter */}
          <select
            value={sourceFilter}
            onChange={(e) =>
              setSourceFilter(e.target.value as "ocm" | "all" | "council")
            }
            style={{
              padding: "0.25rem",
              fontSize: "0.75rem",
              border: "1px solid #374151",
              borderRadius: "0.25rem",
              background: "#1f2937",
              color: "#f9fafb",
            }}
          >
            <option value="ocm">OpenChargeMap</option>
            <option value="all">All sources</option>
            <option value="council">Council</option>
          </select>

          {/* Toggles */}
          <button
            onClick={() => setShowMarkers((v) => !v)}
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
            {showMarkers ? "Markers ✓" : "Markers ✗"}
          </button>

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
            {showHeatmap ? "Heatmap ✓" : "Heatmap ✗"}
          </button>

          {/* Heat opacity slider */}
          {showHeatmap && (
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Opacity
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={heatOpacity}
                onChange={(e) => setHeatOpacity(parseFloat(e.target.value))}
              />
            </label>
          )}
        </div>
      </div>

      {/* Small debug chip */}
      <div
        style={{
          position: "absolute",
          top: "0.75rem",
          right: "0.75rem",
          zIndex: 1000,
          background: "rgba(15, 23, 42, 0.85)",
          color: "#e5e7eb",
          padding: "0.25rem 0.5rem",
          borderRadius: "0.25rem",
          fontSize: "0.75rem",
          border: "1px solid rgba(148,163,184,0.3)",
        }}
        title="Stations returned by the API after filters"
      >
        stations: {stations.length}
      </div>

      {/* Map */}
      <main style={{ height: "100%", width: "100%" }}>
        <MapContainer
          center={mapCenter}
          zoom={13}
          scrollWheelZoom
          ref={mapRef}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Heat layer (under markers, non-interactive) */}
          {showHeatmap && heatPoints.length > 0 && (
            <HeatLayer points={heatPoints} opacity={heatOpacity} />
          )}

          {/* Markers (above heat) */}
          {showMarkers &&
            stations.map((s) => {
              const lat = s.AddressInfo?.Latitude as number;
              const lon = s.AddressInfo?.Longitude as number;
              const isOperational =
                typeof s.StatusType?.IsOperational === "boolean"
                  ? s.StatusType?.IsOperational
                  : null;

              const fill =
                isOperational === null
                  ? "#60a5fa" // blue = unknown
                  : isOperational
                  ? "#22c55e" // green = operational
                  : "#ef4444"; // red = not operational

              return (
                <CircleMarker
                  key={String(s.ID)}
                  center={[lat, lon]}
                  radius={6}
                  pane="markers"
                  bubblingMouseEvents={false}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 2,
                    fillColor: fill,
                    fillOpacity: 1,
                  }}
                >
                  <Popup
                    closeOnClick={false}
                    autoClose={false}
                    keepInView
                    eventHandlers={{
                      add: (e: any) => {
                        try {
                          const L = require("leaflet");
                          const el = e?.popup?.getElement?.();
                          if (el) {
                            L.DomEvent.disableClickPropagation(el);
                            L.DomEvent.disableScrollPropagation(el);
                          }
                        } catch {}
                      },
                    }}
                  >
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
                        Reliability: {(s.Feedback.reliability * 100).toFixed(0)}% (
                        {s.Feedback.count} feedback)
                      </>
                    )}

                    <div style={{ marginTop: "0.5rem" }}>
                      {feedbackOpenId === (s.ID as number) ? (
                        <FeedbackForm
                          stationId={s.ID as number}
                          onSubmitted={() => {
                            setFeedbackVersion((v) => v + 1);
                            setFeedbackOpenId(null);
                          }}
                        />
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setFeedbackOpenId(s.ID as number);
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
                          Leave feedback
                        </button>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
        </MapContainer>

        {/* Heat legend */}
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

        {/* Empty state */}
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

        {/* Error banner */}
        {error && (
          <div
            style={{
              position: "absolute",
              top: "1rem",
              right: "1rem",
              padding: "0.5rem 0.75rem",
              background: "rgba(190,18,60,0.9)",
              borderRadius: "0.375rem",
              color: "#fff",
              fontSize: "0.8rem",
              zIndex: 1000,
            }}
          >
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
