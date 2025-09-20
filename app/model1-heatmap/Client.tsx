"use client";

/**
 * Client map:
 * - Robust search (passes map center to /api/geocode to bias results)
 * - After search, forces a data refresh
 * - If viewport fetch returns 0 stations, falls back to a circle query
 * - Debounced moveend/zoomend fetches (no API spam)
 * - LRU cache, race-protected fetches
 * - Popups stay on top; feedback popups are stable
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { featuresFor, scoreFor, type OCMStation } from "../../lib/model1";
import { useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// ---------- React-Leaflet (client only) ----------
const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });
const Popup        = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });
const Pane         = dynamic(() => import("react-leaflet").then((m) => m.Pane), { ssr: false });

// ---------- Types ----------
type HeatPoint = [number, number, number];
interface StationWithScore extends OCMStation {
  _score: number;
  StatusType?: { Title: string | null; IsOperational: boolean | null };
  Feedback?: { count: number; averageRating: number | null; reliability: number | null };
  DataSource?: string;
}

// ---------- Helpers ----------
const debounce = <F extends (...a: any[]) => void>(fn: F, ms = 450) => {
  let t: any;
  return (...args: Parameters<F>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};
const round = (n: number, dp = 3) => Math.round(n * 10 ** dp) / 10 ** dp;

let lastReqId = 0;
let lastController: AbortController | null = null;

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

function bboxKey(
  b: { north: number; south: number; east: number; west: number } | null | undefined,
  params: { lat: number; lon: number; dist: number },
  conn: string,
  source: string
) {
  if (b) {
    return ["bbox", round(b.west), round(b.south), round(b.east), round(b.north), `conn=${conn || "any"}`, `src=${source}`].join("|");
  }
  return ["circle", round(params.lat), round(params.lon), round(params.dist), `conn=${conn || "any"}`, `src=${source}`].join("|");
}

// ---------- Heat Layer ----------
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

// ---------- Capture Map Instance Reliably ----------
function CaptureMapRef({ onReady }: { onReady: (map: any) => void }) {
  const map = useMap();
  useEffect(() => { if (map) onReady(map); }, [map, onReady]);
  return null;
}

// ---------- Feedback ----------
function FeedbackForm({ stationId, onSubmitted }: { stationId: number; onSubmitted: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";
      const r = await fetch(`${apiBase}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId, rating, comment }),
      });
      if (!r.ok) throw new Error(`Feedback API ${r.status}`);
      setSubmitted(true);
      onSubmitted();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) return <p style={{ color: "#22c55e", fontSize: 12, marginTop: 6 }}>Thank you!</p>;

  return (
    <form onSubmit={submit} onMouseDown={stop} onClick={stop} onWheel={stop}>
      <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Rating (0–5)</label>
      <select value={rating} onChange={(e) => setRating(parseInt(e.target.value, 10))}
        style={selStyle}>
        {[5, 4, 3, 2, 1, 0].map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Comment</label>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional"
        style={taStyle}/>
      <button type="submit" disabled={submitting} style={{ ...btn, width: "100%", opacity: submitting ? 0.7 : 1 }}>
        Submit
      </button>
    </form>
  );
}

// ---------- Main ----------
export default function Client() {
  // initial map params
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

  // data state
  const [stations, setStations] = useState<StationWithScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);

  // ui state
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [heatOpacity, setHeatOpacity] = useState(0.65);
  const [connFilter, setConnFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"ocm" | "all" | "council">("ocm");
  const [feedbackOpenId, setFeedbackOpenId] = useState<number | null>(null);
  const [feedbackVersion, setFeedbackVersion] = useState(0);

  const [searchText, setSearchText] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const mapRef = useRef<any>(null);

  // track bounds
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

  // fetch stations (with fallback if empty)
  useEffect(() => {
    const key = bboxKey(bounds, params, connFilter, sourceFilter);

    async function run() {
      setError(null);

      const cached = getCache(key);
      if (cached) setStations(cached);

      const reqId = ++lastReqId;
      if (lastController) lastController.abort();
      const controller = new AbortController();
      lastController = controller;

      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";
      const buildURL = (useBounds: boolean) => {
        if (useBounds && bounds) {
          const { north, south, east, west } = bounds;
          return `${apiBase}/api/stations?north=${north}&south=${south}&east=${east}&west=${west}`;
        }
        const m = mapRef.current;
        const c = m?.getCenter?.();
        const lat = c ? c.lat : params.lat;
        const lon = c ? c.lng : params.lon;
        return `${apiBase}/api/stations?lat=${lat}&lon=${lon}&dist=15`;
      };

      const addFilters = (u: string) => {
        let url = u;
        if (connFilter) url += `&conn=${encodeURIComponent(connFilter)}`;
        if (sourceFilter && sourceFilter !== "all") url += `&source=${encodeURIComponent(sourceFilter)}`;
        else if (sourceFilter === "all") url += `&source=all`;
        return url;
      };

      try {
        setLoading(true);

        // try viewport first
        let url = addFilters(buildURL(true));
        let res = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error(`API responded with ${res.status}`);
        let json = await res.json();
        let data: OCMStation[] = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];
        if (!Array.isArray(json) && json?.error) setError(String(json.error));

        // if viewport has none, fallback to circle around center
        if ((data?.length || 0) === 0) {
          url = addFilters(buildURL(false));
          res = await fetch(url, { cache: "no-store", signal: controller.signal });
          if (res.ok) {
            json = await res.json();
            data = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];
          }
        }

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

    run();
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

  // search
  async function goToSearch() {
    const q = searchText.trim();
    if (!q) return;
    const map = mapRef.current;
    if (!map) {
      setSearchError("Map not ready yet. Try again in a second.");
      return;
    }

    setSearchError(null);
    setSearchLoading(true);
    try {
      const c = map.getCenter?.();
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}${c ? `&lat=${c.lat}&lon=${c.lng}` : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        let msg = "Location not found.";
        try { msg = (await res.json())?.error || msg; } catch {}
        setSearchError(msg);
        return;
      }
      const { lat, lon } = (await res.json()) as { lat: number; lon: number };
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const z = Math.max(map.getZoom?.() ?? 12, 13);
        map.flyTo([lat, lon], z, { animate: true, duration: 0.9 });
        // Force an immediate bounds update so we fetch right away
        setTimeout(() => {
          const b = map.getBounds?.();
          if (b) {
            setBounds({
              north: b.getNorth(),
              south: b.getSouth(),
              east: b.getEast(),
              west: b.getWest(),
            });
          }
        }, 950);
      } else {
        setSearchError("Location not found.");
      }
    } catch {
      setSearchError("Search failed. Try a more specific name/postcode.");
    } finally {
      setSearchLoading(false);
    }
  }

  const center: [number, number] = [params.lat, params.lon];

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      <style>{`
        .leaflet-pane.leaflet-popup-pane { z-index: 1200 !important; }
        .leaflet-heatmap-layer { pointer-events: none; }
      `}</style>

      {/* Toolbar */}
      <div style={toolbar}>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Autodun EV Map</h1>
        <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>Explore EV hotspots & charging insights</p>

        <div style={toolbarRow}>
          <button
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition((pos) => {
                const { latitude, longitude } = pos.coords;
                mapRef.current?.setView([latitude, longitude], 13);
              });
            }}
            style={btn}
          >
            Use my location
          </button>

          <button onClick={() => mapRef.current?.setView(center, 13)} style={btn}>Reset view</button>

          <select value={connFilter} onChange={(e) => setConnFilter(e.target.value)} style={selStyle}>
            <option value="">All connectors</option>
            <option value="ccs">CCS</option>
            <option value="type 2">Type 2</option>
            <option value="chademo">CHAdeMO</option>
          </select>

          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as any)} style={selStyle}>
            <option value="ocm">OpenChargeMap</option>
            <option value="all">All sources</option>
            <option value="council">Council</option>
          </select>

          <button onClick={() => setShowMarkers((v) => !v)} style={btn}>{showMarkers ? "Markers ✓" : "Markers ✗"}</button>
          <button onClick={() => setShowHeatmap((v) => !v)} style={btn}>{showHeatmap ? "Heatmap ✓" : "Heatmap ✗"}</button>

          {showHeatmap && (
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Heatmap
              <input type="range" min={0.1} max={1} step={0.05} value={heatOpacity}
                     onChange={(e) => setHeatOpacity(parseFloat(e.target.value))} />
            </label>
          )}

          <input
            placeholder="Search postcode or area (e.g. IG4 5HR, Glasgow)"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && goToSearch()}
            style={inputStyle}
          />
          <button onClick={goToSearch} disabled={searchLoading} style={{ ...btn, opacity: searchLoading ? 0.6 : 1 }}>
            {searchLoading ? "Searching…" : "Search"}
          </button>

          {loading && <span style={{ fontSize: 12 }}>Loading…</span>}
        </div>

        {searchError && <div style={{ marginTop: 6, fontSize: 12, color: "#fca5a5" }}>{searchError}</div>}
      </div>

      {/* Count chip */}
      <div style={chip}>stations: {stations.length}</div>

      {/* Map */}
      <main style={{ height: "100%", width: "100%" }}>
        <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
          <CaptureMapRef onReady={(m) => (mapRef.current = m)} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Pane name="heat" style={{ zIndex: 399, pointerEvents: "none" }} />
          <Pane name="markers" style={{ zIndex: 401 }} />

          {showHeatmap && heatPoints.length > 0 && <HeatLayer points={heatPoints} opacity={heatOpacity} />}

          {showMarkers &&
            stations.map((s) => {
              const lat = s.AddressInfo?.Latitude as number;
              const lon = s.AddressInfo?.Longitude as number;
              const isOperational =
                typeof s.StatusType?.IsOperational === "boolean" ? s.StatusType?.IsOperational : null;
              const fill = isOperational === null ? "#60a5fa" : isOperational ? "#22c55e" : "#ef4444";

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
                        Reliability: {(s.Feedback.reliability * 100).toFixed(0)}% ({s.Feedback.count} feedback)
                      </>
                    )}
                    <div style={{ marginTop: 8 }}>
                      {feedbackOpenId === (s.ID as number) ? (
                        <FeedbackForm
                          stationId={s.ID as number}
                          onSubmitted={() => {
                            setFeedbackVersion((v) => v + 1);
                            setFeedbackOpenId(null);
                          }}
                        />
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setFeedbackOpenId(s.ID as number); }} style={btn}>
                          Leave feedback
                        </button>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
        </MapContainer>

        {/* Legend / Empty / Error */}
        {showHeatmap && (
          <div style={legend}>
            <div style={legendBar} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Low</span><span>High</span>
            </div>
          </div>
        )}
        {!loading && !error && stations.length === 0 && (
          <div style={empty}>No stations found here yet. Try zooming out, moving the map, or changing filters.</div>
        )}
        {error && <div style={errBanner}>{error}</div>}
      </main>
    </div>
  );
}

// ---------- styles ----------
const btn: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: 12,
  border: "1px solid #374151",
  borderRadius: 4,
  background: "#1f2937",
  color: "#f9fafb",
  cursor: "pointer",
};

const selStyle: React.CSSProperties = {
  padding: 4,
  fontSize: 12,
  border: "1px solid #374151",
  borderRadius: 4,
  background: "#1f2937",
  color: "#f9fafb",
};

const inputStyle: React.CSSProperties = {
  padding: 4,
  fontSize: 12,
  border: "1px solid #374151",
  borderRadius: 4,
  background: "#0b1220",
  color: "#f9fafb",
  minWidth: 220,
};

const taStyle: React.CSSProperties = {
  width: "100%",
  height: "3rem",
  padding: 4,
  fontSize: 12,
  border: "1px solid #374151",
  borderRadius: 4,
  background: "#0b1220",
  color: "#f9fafb",
  marginBottom: 6,
  resize: "vertical",
};

const toolbar: React.CSSProperties = {
  position: "absolute",
  top: 8,
  left: 8,
  zIndex: 650, // below popup-pane (1200), above map
  background: "rgba(12, 19, 38, 0.9)",
  padding: 12,
  borderRadius: 6,
  color: "#f9fafb",
  maxWidth: 620,
};

const toolbarRow: React.CSSProperties = {
  marginTop: 8,
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const chip: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 640,
  background: "rgba(15, 23, 42, 0.85)",
  color: "#e5e7eb",
  padding: "4px 8px",
  borderRadius: 4,
  fontSize: 12,
  border: "1px solid rgba(148,163,184,0.3)",
};

const legend: React.CSSProperties = {
  position: "absolute",
  bottom: 16,
  left: 16,
  padding: 8,
  background: "rgba(0,0,0,0.6)",
  borderRadius: 6,
  color: "#f9fafb",
  fontSize: 12,
  zIndex: 640,
};

const legendBar: React.CSSProperties = {
  width: 160,
  height: 10,
  background:
    "linear-gradient(to right, rgba(42,133,255,1) 0%, rgba(110,216,89,1) 25%, rgba(255,255,0,1) 50%, rgba(255,128,0,1) 75%, rgba(255,0,0,1) 100%)",
  marginBottom: 4,
};

const empty: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  padding: 16,
  background: "rgba(0,0,0,0.7)",
  borderRadius: 8,
  color: "#f9fafb",
  fontSize: 14,
  zIndex: 640,
  textAlign: "center",
  maxWidth: "80%",
};

const errBanner: React.CSSProperties = {
  position: "absolute",
  top: 16,
  right: 16,
  padding: "8px 12px",
  background: "rgba(190,18,60,0.9)",
  borderRadius: 8,
  color: "#fff",
  fontSize: 13,
  zIndex: 640,
};
