"use client";

/**
 * Client-only Model-1 EV Heatmap.
 * - Fetches stations from /api/stations or /api/sites (bbox)
 * - Scores with lib/model1
 * - Toggles heat vs markers
 * - Feedback form posts to /api/feedback
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { featuresFor, scoreFor, type OCMStation } from "../../lib/model1";
import { useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const TileLayer     = dynamic(() => import("react-leaflet").then(m => m.TileLayer),     { ssr: false });
const Marker        = dynamic(() => import("react-leaflet").then(m => m.Marker),        { ssr: false });
const Popup         = dynamic(() => import("react-leaflet").then(m => m.Popup),         { ssr: false });

type HeatPoint = [number, number, number];

interface StationWithScore extends OCMStation {
  _score: number;
  StatusType?: { Title: string | null; IsOperational: boolean | null };
  Feedback?: { count: number; averageRating: number | null; reliability: number | null };
  DataSource?: string;
}

// ---- Feedback form ----------------------------------------------------------
function FeedbackForm({ stationId, onSubmitted }: { stationId: number; onSubmitted: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
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

  if (submitted) return <p style={{ color: "#22c55e", fontSize: "0.75rem", marginTop: ".5rem" }}>Thank you for your feedback!</p>;

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: ".5rem" }}>
      <label style={{ display: "block", fontSize: ".75rem", marginBottom: ".25rem" }}>Rating (0–5):</label>
      <select
        value={rating}
        onChange={(e) => setRating(parseInt(e.target.value, 10))}
        style={{ padding: ".25rem", fontSize: ".75rem", border: "1px solid #374151", borderRadius: ".25rem", background: "#1f2937", color: "#f9fafb", width: "100%", marginBottom: ".25rem" }}
      >
        {[5,4,3,2,1,0].map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <label style={{ display: "block", fontSize: ".75rem", marginBottom: ".25rem" }}>Comment:</label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment"
        style={{ width: "100%", height: "3rem", padding: ".25rem", fontSize: ".75rem", border: "1px solid #374151", borderRadius: ".25rem", background: "#0b1220", color: "#f9fafb", marginBottom: ".25rem", resize: "vertical" }}
      />
      <button
        type="submit" disabled={submitting}
        style={{ padding: ".25rem .5rem", fontSize: ".75rem", border: "1px solid #374151", borderRadius: ".25rem", background: submitting ? "#374151" : "#1f2937", color: "#f9fafb", cursor: submitting ? "not-allowed" : "pointer", width: "100%" }}
      >
        Submit
      </button>
    </form>
  );
}

// ---- Heat layer wrapper (leaflet.heat) -------------------------------------
function HeatLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (cancelled) return;
      const L = (await import("leaflet")).default as any;
      await import("leaflet.heat");

      if (layerRef.current && map) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
      if (!map || points.length === 0) return;

      const layer = (L as any).heatLayer(points, { radius: 45, blur: 25, maxZoom: 17, max: 1.0, minOpacity: 0.35 });
      layer.addTo(map);
      layerRef.current = layer;
    })();

    return () => {
      cancelled = true;
      if (layerRef.current && map) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
    };
  }, [map, points]);

  return null;
}

// ---- Client UI --------------------------------------------------------------
export default function Model1HeatmapClient() {
  // Read ?lat&lon&dist lazily (client only)
  const [params] = useState(() => {
    if (typeof window === "undefined") return { lat: 51.5074, lon: -0.1278, dist: 25 };
    const sp = new URLSearchParams(window.location.search);
    const lat = parseFloat(sp.get("lat") || "51.5074");
    const lon = parseFloat(sp.get("lon") || "-0.1278");
    const dist = parseFloat(sp.get("dist") || "25");
    return { lat: Number.isFinite(lat) ? lat : 51.5074, lon: Number.isFinite(lon) ? lon : -0.1278, dist: Number.isFinite(dist) ? dist : 25 };
  });

  const [stations, setStations] = useState<StationWithScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bounds, setBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [connFilter, setConnFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [feedbackOpenId, setFeedbackOpenId] = useState<number | null>(null);
  const [feedbackVersion, setFeedbackVersion] = useState(0);

  // Fetch
  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";
        let url = "";

        if (bounds) {
          const { north, south, east, west } = bounds;
          url = `${apiBase}/api/sites?bbox=${west},${south},${east},${north}`;
        } else {
          url = `${apiBase}/api/stations?lat=${params.lat}&lon=${params.lon}&dist=${params.dist}`;
        }
        if (connFilter) url += `&conn=${encodeURIComponent(connFilter)}`;
        if (sourceFilter && sourceFilter !== "all") url += `&source=${encodeURIComponent(sourceFilter)}`;

        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) throw new Error(`API responded with ${res.status}`);
        const data: OCMStation[] = await res.json();

        const scored: StationWithScore[] = data
          .map((s) => {
            const lat = s?.AddressInfo?.Latitude;
            const lon = s?.AddressInfo?.Longitude;
            if (typeof lat !== "number" || typeof lon !== "number") return null;
            const sc = scoreFor(featuresFor(s));
            return Object.assign({}, s, { _score: sc });
          })
          .filter(Boolean) as StationWithScore[];

        setStations(scored);
      } catch (e: any) {
        setError(e?.message || "Failed to load stations");
        setStations([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [bounds, params.lat, params.lon, params.dist, connFilter, sourceFilter, feedbackVersion]);

  // Heat weights [0..1]
  const heatPoints: HeatPoint[] = useMemo(() => {
    if (!stations.length) return [];
    const values = stations.map(s => s._score);
    const min = Math.min(...values), max = Math.max(...values);
    const denom = max - min || 1;
    return stations.map(s => [s.AddressInfo!.Latitude as number, s.AddressInfo!.Longitude as number, (s._score - min)/denom] as HeatPoint);
  }, [stations]);

  const mapRef = useRef<any>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const b = map.getBounds?.(); if (!b) return;
      setBounds({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    };
    update();
    map.on?.("moveend", update);
    map.on?.("zoomend", update);
    return () => { map.off?.("moveend", update); map.off?.("zoomend", update); };
  }, []);

  const mapCenter: [number, number] = [params.lat, params.lon];

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      {/* Controls */}
      <div style={{ position: "absolute", top: ".5rem", left: ".5rem", zIndex: 1000, background: "rgba(12, 19, 38, 0.9)", padding: ".75rem", borderRadius: ".25rem", color: "#f9fafb" }}>
        <h1 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Autodun EV Map</h1>
        <p style={{ margin: 0, fontSize: ".75rem", color: "#9ca3af" }}>Explore EV hotspots &amp; charging insights</p>
        <div style={{ marginTop: ".5rem", display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
          <button onClick={() => { if (!navigator.geolocation) return; navigator.geolocation.getCurrentPosition(pos => { mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 13); }); }} style={{ padding: ".25rem .5rem", fontSize: ".75rem", border: "1px solid #374151", borderRadius: ".25rem", background: "#1f2937", color: "#f9fafb", cursor: "pointer" }}>Use my location</button>
          <button onClick={() => { mapRef.current?.setView(mapCenter, 13); }} style={{ padding: ".25rem .5rem", fontSize: ".75rem", border: "1px solid #374151", borderRadius: ".25rem", background: "#1f2937", color: "#f9fafb", cursor: "pointer" }}>Reset view</button>
          <select value={connFilter} onChange={(e) => setConnFilter(e.target.value)} style={{ padding: ".25rem", fontSize: ".75rem", border: "1px solid #374151", borderRadius: ".25rem", background: "#1f2937", color: "#f9fafb" }}>
            <option value="">All connectors</option>
            <option value="ccs">CCS</option>
            <option value="type 2">Type 2</option>
            <option value="chademo">CHAdeMO</option>
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={{ padding: ".25rem", fontSize: ".75rem", border: "1px solid #374151", borderRadius: ".25rem", background: "#1f2937", color: "#f9fafb" }}>
            <option value="all">All sources</option>
            <option value="ocm">OpenChargeMap</option>
            <option value="council">Council</option>
          </select>
          <button onClick={() => setShowHeatmap(v => !v)} style={{ padding: ".25rem .5rem", fontSize: ".75rem", border: "1px solid #374151", borderRadius: ".25rem", background: "#1f2937", color: "#f9fafb", cursor: "pointer" }}>
            {showHeatmap ? "Markers" : "Heatmap"}
          </button>
        </div>
      </div>

      {/* Map */}
      <main style={{ height: "100%", width: "100%" }}>
        <MapContainer
          center={mapCenter}
          zoom={13}
          scrollWheelZoom
          ref={mapRef}
          style={{ height: "100%", width: "100%" }}
          whenCreated={(map) => { mapRef.current = map; }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {showHeatmap && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}

          {!showHeatmap && stations.map((s, idx) => {
            const lat = s.AddressInfo?.Latitude as number;
            const lon = s.AddressInfo?.Longitude as number;
            const isOperational = typeof s.StatusType?.IsOperational === "boolean" ? s.StatusType?.IsOperational : null;

            let icon: any = undefined;
            if (typeof window !== "undefined" && isOperational !== null) {
              const L = require("leaflet");
              icon = L.divIcon({
                html: `<div style="width:14px;height:14px;background:${isOperational ? "#22c55e" : "#ef4444"};border-radius:50%;border:2px solid #ffffff;"></div>`,
                iconSize: [18, 18],
                className: "",
              });
            }

            return (
              <Marker key={idx} position={[lat, lon]} icon={icon}>
                <Popup>
                  <strong>{s.AddressInfo?.Title || "Unnamed Station"}</strong>
                  <br />
                  {s.AddressInfo?.AddressLine1 || ""}{s.AddressInfo?.Town ? `, ${s.AddressInfo.Town}` : ""}{s.AddressInfo?.Postcode ? ` ${s.AddressInfo.Postcode}` : ""}
                  <br />
                  Score: {s._score.toFixed(2)}
                  {s.DataSource && (<><br />Source: {s.DataSource === "Council" ? "Council data" : "OpenChargeMap"}</>)}
                  {s.StatusType?.Title && (<><br />Status: {s.StatusType.Title}{typeof s.StatusType.IsOperational === "boolean" && (s.StatusType.IsOperational ? " (Operational)" : " (Not Operational)")} </>)}
                  {s.Feedback && s.Feedback.reliability != null && (<><br />Reliability: {(s.Feedback.reliability * 100).toFixed(0)}% ({s.Feedback.count} feedback)</>)}
                  <div style={{ marginTop: ".5rem" }}>
                    {feedbackOpenId === (s.ID as number) ? (
                      <FeedbackForm
                        stationId={s.ID as number}
                        onSubmitted={() => { setFeedbackVersion(v => v + 1); setFeedbackOpenId(null); }}
                      />
                    ) : (
                      <button
                        onClick={() => setFeedbackOpenId(s.ID as number)}
                        style={{ padding: ".25rem .5rem", fontSize: ".75rem", border: "1px solid #374151", borderRadius: ".25rem", background: "#1f2937", color: "#f9fafb", cursor: "pointer" }}
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

        {/* Legend */}
        {showHeatmap && (
          <div style={{ position: "absolute", bottom: "1rem", left: "1rem", padding: ".5rem", background: "rgba(0,0,0,0.6)", borderRadius: ".25rem", color: "#f9fafb", fontSize: ".75rem", zIndex: 1000 }}>
            <div style={{ width: 160, height: 10, background: "linear-gradient(to right, rgba(42,133,255,1) 0%, rgba(110,216,89,1) 25%, rgba(255,255,0,1) 50%, rgba(255,128,0,1) 75%, rgba(255,0,0,1) 100%)", marginBottom: ".25rem" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Low</span><span>High</span></div>
          </div>
        )}

        {/* Empty / Error */}
        {!loading && !error && stations.length === 0 && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", padding: "1rem", background: "rgba(0,0,0,0.7)", borderRadius: ".5rem", color: "#f9fafb", fontSize: ".875rem", zIndex: 1000, textAlign: "center", maxWidth: "80%" }}>
            No stations found in this area. Try zooming out or moving the map.
          </div>
        )}
        {error && (
          <div style={{ position: "absolute", top: "1rem", right: "1rem", padding: ".5rem .75rem", background: "rgba(190,18,60,0.9)", borderRadius: ".375rem", color: "#fff", fontSize: ".8rem", zIndex: 1000 }}>
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
