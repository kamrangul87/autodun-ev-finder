"use client";

/**
 * Autodun EV Map (client)
 * - Debounced bbox fetch (no API spam) + latest-request-wins
 * - Client LRU cache (shows "cache: hit")
 * - Heatmap + markers with panes (heat under markers)
 * - Stable popups (no accidental close while interacting)
 * - Search: robust geocoding (UK postcode normalization + GB fallback)
 * - UI: toolbar narrower; popups always above toolbar
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { featuresFor, scoreFor, type OCMStation } from "../../lib/model1";

// ---------------- request coordination (module scope) ------------------------
let lastReqId = 0;
let lastController: AbortController | null = null;

// ---------------- simple LRU cache (module scope) ---------------------------
type CacheEntry<T> = { data: T; t: number };
const MAX_CACHE = 30;
const stationCache = new Map<string, CacheEntry<StationWithScore[]>>();
function setCache(key: string, data: StationWithScore[]) {
  stationCache.set(key, { data, t: Date.now() });
  if (stationCache.size > MAX_CACHE) {
    const oldest = [...stationCache.entries()].sort((a, b) => a[1].t - b[1].t)[0]?.[0];
    if (oldest) stationCache.delete(oldest);
  }
}
function getCache(key: string) {
  const hit = stationCache.get(key);
  if (!hit) return undefined;
  stationCache.delete(key);
  stationCache.set(key, { data: hit.data, t: Date.now() });
  return hit.data;
}

// ---------------- helpers ---------------------------------------------------
const debounce = <F extends (...a: any[]) => void>(fn: F, ms = 450) => {
  let t: any;
  return (...args: Parameters<F>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};
const round = (n: number, dp = 3) => Math.round(n * 10 ** dp) / 10 ** dp;

function bboxKey(
  b:
    | { north: number; south: number; east: number; west: number }
    | null
    | undefined,
  params: { lat: number; lon: number; dist: number },
  conn: string,
  source: string
) {
  if (b) {
    return [
      "bbox",
      round(b.west),
      round(b.south),
      round(b.east),
      round(b.north),
      `conn=${conn || "any"}`,
      `src=${source}`,
    ].join("|");
  }
  return [
    "circle",
    round(params.lat),
    round(params.lon),
    round(params.dist),
    `conn=${conn || "any"}`,
    `src=${source}`,
  ].join("|");
}

// Normalize UK postcodes like "ig45hr" -> "IG4 5HR"
function normalizeUKPostcode(q: string) {
  const s = q.toUpperCase().replace(/\s+/g, "");
  if (s.length < 5 || s.length > 7) return q.trim();
  return s.slice(0, s.length - 3) + " " + s.slice(-3);
}

// ---------------- react-leaflet (client-only) -------------------------------
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
const Pane = dynamic(() => import("react-leaflet").then((m) => m.Pane), {
  ssr: false,
});
import { useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// ---------------- types -----------------------------------------------------
type HeatPoint = [number, number, number];
interface StationWithScore extends OCMStation {
  _score: number;
  StatusType?: { Title: string | null; IsOperational: boolean | null };
  Feedback?: { count: number; averageRating: number | null; reliability: number | null };
  DataSource?: string;
}

// ---------------- heat layer ------------------------------------------------
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
        radius: 45, blur: 25, maxZoom: 17, max: 1.0,
        minOpacity: opacity, pane: "heat",
      });
      layer.addTo(map);
      layerRef.current = layer;
    }

    mount().catch(console.error);
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

// ---------------- feedback form --------------------------------------------
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

  // Stop propagation so Popup stays open while typing/clicking
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <form
      onSubmit={handleSubmit}
      onMouseDown={stop}
      onClick={stop}
      onWheel={stop}
      style={{ marginTop: "0.5rem" }}
    >
      <label style={{ display: "block", fontSize: "0.75rem", marginBottom: 4 }}>
        Rating (0–5)
      </label>
      <select
        value={rating}
        onChange={(e) => setRating(parseInt(e.target.value, 10))}
        style={{
          width: "100%", padding: "0.25rem", fontSize: "0.75rem",
          border: "1px solid #374151", borderRadius: 4, background: "#1f2937", color: "#f9fafb",
          marginBottom: 6,
        }}
      >
        {[5, 4, 3, 2, 1, 0].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>

      <label style={{ display: "block", fontSize: "0.75rem", marginBottom: 4 }}>
        Comment
      </label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment"
        style={{
          width: "100%", height: "3rem", padding: "0.25rem",
          fontSize: "0.75rem", border: "1px solid #374151", borderRadius: 4,
          background: "#0b1220", color: "#f9fafb", marginBottom: 6, resize: "vertical",
        }}
      />
      <button
        type="submit"
        disabled={submitting}
        style={{
          width: "100%", padding: "0.25rem 0.5rem", fontSize: "0.75rem",
          border: "1px solid #374151", borderRadius: 4,
          background: submitting ? "#374151" : "#1f2937", color: "#f9fafb",
          cursor: submitting ? "not-allowed" : "pointer",
        }}
      >
        Submit
      </button>
    </form>
  );
}

// ---------------- component -------------------------------------------------
export default function Client() {
  // initial params
  const [params] = useState(() => {
    if (typeof window === "undefined") return { lat: 51.5074, lon: -0.1278, dist: 25 };
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

  const [bounds, setBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);

  // layers
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [heatOpacity, setHeatOpacity] = useState(0.65);

  // filters
  const [connFilter, setConnFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"ocm" | "all" | "council">("ocm");

  // feedback
  const [feedbackOpenId, setFeedbackOpenId] = useState<number | null>(null);
  const [feedbackVersion, setFeedbackVersion] = useState(0);

  // cache indicator
  const [cacheHitLast, setCacheHitLast] = useState(false);

  // search
  const [searchText, setSearchText] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // map ref
  const mapRef = useRef<any>(null);

  // debounced bounds watcher
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = debounce(() => {
      const b = map.getBounds?.();
      if (!b) return;
      setBounds({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    }, 450);

    update();
    map.on?.("moveend", update);
    map.on?.("zoomend", update);
    return () => {
      map.off?.("moveend", update);
      map.off?.("zoomend", update);
    };
  }, []);

  // fetch stations (cache + race-safe)
  useEffect(() => {
    const key = bboxKey(bounds, params, connFilter, sourceFilter);

    async function fetchStations() {
      setError(null);

      const cached = getCache(key);
      setCacheHitLast(!!cached);
      if (cached) setStations(cached);

      const reqId = ++lastReqId;
      if (lastController) lastController.abort();
      const controller = new AbortController();
      lastController = controller;

      try {
        setLoading(true);
        const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";
        let url = "";
        if (bounds) {
          const { north, south, east, west } = bounds;
          url = `${apiBase}/api/stations?north=${north}&south=${south}&east=${east}&west=${west}`;
        } else {
          url = `${apiBase}/api/stations?lat=${params.lat}&lon=${params.lon}&dist=${params.dist}`;
        }
        if (connFilter) url += `&conn=${encodeURIComponent(connFilter)}`;
        if (sourceFilter && sourceFilter !== "all") url += `&source=${encodeURIComponent(sourceFilter)}`;
        else if (sourceFilter === "all") url += `&source=all`;

        const res = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error(`API responded with ${res.status}`);

        const json = await res.json();
        const data: OCMStation[] = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];
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

        setCache(key, scored);
        if (reqId === lastReqId) setStations(scored);
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(e?.message || "Failed to load stations");
      } finally {
        if (reqId === lastReqId) setLoading(false);
      }
    }

    fetchStations();
  }, [bounds, params.lat, params.lon, params.dist, connFilter, sourceFilter, feedbackVersion]);

  // heat points
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

  // geocode
  async function goToSearch() {
    const qRaw = searchText.trim();
    if (!qRaw || !mapRef.current) return;

    const q = normalizeUKPostcode(qRaw);
    setSearchError(null);
    setSearchLoading(true);

    try {
      const tries = [
        // postcode-specific (GB), then generic q with GB fallback
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&postalcode=${encodeURIComponent(q)}`,
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(q)}`,
      ];

      let hit: any = null;
      for (const url of tries) {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) continue;
        const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
        if (Array.isArray(arr) && arr.length) { hit = arr[0]; break; }
      }

      if (!hit) { setSearchError("Location not found."); return; }

      const lat = parseFloat(hit.lat);
      const lon = parseFloat(hit.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const map = mapRef.current;
        const targetZoom = Math.max(map.getZoom?.() ?? 12, 13);
        map.flyTo([lat, lon], targetZoom, { animate: true, duration: 0.9 });
      } else {
        setSearchError("Location not found.");
      }
    } catch (e) {
      console.error("Geocode failed", e);
      setSearchError("Search failed. Try a more specific name.");
    } finally {
      setSearchLoading(false);
    }
  }

  // --------------------------------------------------------------------------
  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      {/* Raise popup above everything; also make heat non-interactive */}
      <style>{`
        .leaflet-pane.leaflet-popup-pane { z-index: 1200 !important; }
        .leaflet-pane.leaflet-heatmap-layer, .leaflet-pane#heat { pointer-events: none; }
      `}</style>

      {/* Toolbar — narrower to avoid covering map center */}
      <div
        style={{
          position: "absolute",
          top: "0.5rem",
          left: "0.5rem",
          zIndex: 650,              // below popup (700), above map panes
          background: "rgba(12, 19, 38, 0.9)",
          padding: "0.75rem",
          borderRadius: "0.25rem",
          color: "#f9fafb",
          maxWidth: 560,
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Autodun EV Map</h1>
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
            onClick={() => mapRef.current?.setView([params.lat, params.lon], 13)}
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

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as "ocm" | "all" | "council")}
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

          {/* Search */}
          <input
            placeholder="Search postcode or area (e.g. EC1A, Glasgow)"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && goToSearch()}
            style={{
              padding: "0.25rem",
              fontSize: "0.75rem",
              border: "1px solid #374151",
              borderRadius: "0.25rem",
              background: "#0b1220",
              color: "#f9fafb",
              minWidth: 220,
            }}
          />
          <button
            onClick={goToSearch}
            disabled={searchLoading}
            style={{
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              border: "1px solid #374151",
              borderRadius: "0.25rem",
              background: searchLoading ? "#374151" : "#1f2937",
              color: "#f9fafb",
              cursor: searchLoading ? "not-allowed" : "pointer",
            }}
          >
            {searchLoading ? "Searching…" : "Search"}
          </button>

          {loading && <span style={{ fontSize: "0.75rem" }}>Loading…</span>}
        </div>

        {searchError && (
          <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#fca5a5" }}>
            {searchError}
          </div>
        )}
      </div>

      {/* status chip */}
      <div
        style={{
          position: "absolute",
          top: "0.75rem",
          right: "0.75rem",
          zIndex: 640,
          background: "rgba(15, 23, 42, 0.85)",
          color: "#e5e7eb",
          padding: "0.25rem 0.5rem",
          borderRadius: "0.25rem",
          fontSize: "0.75rem",
          border: "1px solid rgba(148,163,184,0.3)",
        }}
        title="Stations returned by the API after filters"
      >
        stations: {stations.length}{cacheHitLast ? " • cache: hit" : ""}
      </div>

      {/* map */}
      <main style={{ height: "100%", width: "100%" }}>
        <MapContainer
          center={[params.lat, params.lon]}
          zoom={13}
          scrollWheelZoom
          ref={mapRef}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* panes */}
          <Pane name="heat" style={{ zIndex: 399, pointerEvents: "none" }} />
          <Pane name="markers" style={{ zIndex: 401 }} />

          {/* heat under markers */}
          {showHeatmap && heatPoints.length > 0 && (
            <HeatLayer points={heatPoints} opacity={heatOpacity} />
          )}

          {/* markers */}
          {showMarkers &&
            stations.map((s) => {
              const lat = s.AddressInfo?.Latitude as number;
              const lon = s.AddressInfo?.Longitude as number;
              const isOperational =
                typeof s.StatusType?.IsOperational === "boolean"
                  ? s.StatusType?.IsOperational
                  : null;

              const fill =
                isOperational === null ? "#60a5fa" : isOperational ? "#22c55e" : "#ef4444";

              return (
                <CircleMarker
                  key={String(s.ID)}
                  center={[lat, lon]}
                  radius={6}
                  pane="markers"
                  bubblingMouseEvents={false}
                  pathOptions={{ color: "#ffffff", weight: 2, fillColor: fill, fillOpacity: 1 }}
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
                        Source: {s.DataSource === "Council" ? "Council data" : "OpenChargeMap"}
                      </>
                    )}
                    {s.StatusType?.Title && (
                      <>
                        <br />
                        Status: {s.StatusType.Title}
                        {typeof s.StatusType.IsOperational === "boolean" &&
                          (s.StatusType.IsOperational ? " (Operational)" : " (Not Operational)")}
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

        {/* heat legend */}
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
              zIndex: 640,
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

        {/* empty state */}
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
              zIndex: 640,
              textAlign: "center",
              maxWidth: "80%",
            }}
          >
            No stations found in this area. Try zooming out or moving the map.
          </div>
        )}

        {/* error banner */}
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
              zIndex: 640,
            }}
          >
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
