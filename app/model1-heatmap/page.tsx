"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

// Dynamic imports to avoid SSR issues
const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const TileLayer     = dynamic(() => import("react-leaflet").then(m => m.TileLayer),     { ssr: false });
const Marker        = dynamic(() => import("react-leaflet").then(m => m.Marker),        { ssr: false });

// Model-1 scoring (used when we actually receive OCM-shape data)
import { featuresFor, scoreFor, type OCMStation } from "../../lib/model1";

// ---------------- Types & helpers ----------------

type HeatPoint = [number, number, number];

type AnySite =
  | {
      // our simplified “sites” shape
      id?: number | string;
      lat?: number;
      lon?: number;
      name?: string;
      postcode?: string | null;
      connectors?: number;
      maxPowerKw?: number;
      status?: "up" | "down";
      source?: string; // "ocm" | "council"
      // carry raw for popup/panel
      _raw?: any;
    }
  | OCMStation;

function pick(v: any, keys: string[]) {
  for (const k of keys) {
    const val = v?.[k];
    if (val != null) return val;
  }
  return undefined;
}

/** Convert either OCMStation or simplified site into a common shape */
function normalize(item: any) {
  const lat =
    item?.AddressInfo?.Latitude ??
    item?.lat ??
    item?.Latitude;

  const lon =
    item?.AddressInfo?.Longitude ??
    item?.lon ??
    item?.Longitude;

  const name =
    item?.AddressInfo?.Title ??
    item?.name ??
    item?.Title ??
    "EV charge point";

  const postcode =
    item?.AddressInfo?.Postcode ??
    item?.postcode ??
    item?.Postcode ??
    null;

  const connectors =
    Array.isArray(item?.Connections) ? item.Connections.length : item?.connectors ?? undefined;

  const maxPowerKw = (() => {
    if (Array.isArray(item?.Connections)) {
      return item.Connections.reduce((m: number, c: any) => {
        const p = Number(c?.PowerKW ?? 0);
        return isFinite(p) ? Math.max(m, p) : m;
      }, 0);
    }
    return item?.maxPowerKw ?? undefined;
  })();

  const status =
    item?.StatusType?.IsOperational === false ? "down"
    : item?.StatusType?.IsOperational === true ? "up"
    : (item?.status as "up" | "down" | undefined);

  const source =
    item?.source ??
    (item?.DataProvider?.Title ? "ocm" : undefined);

  // scoring: prefer model-1 if we truly have an OCMStation
  let score = 1;
  if (item?.AddressInfo && Array.isArray(item?.Connections)) {
    try {
      score = scoreFor(featuresFor(item as OCMStation));
    } catch {
      score = 1;
    }
  } else if (typeof maxPowerKw === "number" && isFinite(maxPowerKw)) {
    score = Math.max(1, maxPowerKw);
  }

  return {
    id: item?.ID ?? item?.id ?? name,
    lat: Number(lat),
    lon: Number(lon),
    name,
    postcode: postcode ?? null,
    connectors,
    maxPowerKw,
    status,
    source,
    score,
    _raw: item,
  };
}

function getApiBase() {
  return process.env.NEXT_PUBLIC_API_BASE ?? "";
}

// ---------------- Feedback ----------------

function FeedbackForm({
  stationId,
  onSubmitted,
}: {
  stationId: number | string;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || done) return;
    setBusy(true);
    try {
      await fetch(`${getApiBase()}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId, rating, comment }),
      });
      setDone(true);
      onSubmitted();
    } catch (_) {
      // ignore for demo
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p style={{ color: "#16a34a", fontSize: 12, marginTop: 8 }}>Thanks for your feedback!</p>;
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 6, marginTop: 8 }}>
      <label style={{ fontSize: 12 }}>Rating (0–5)</label>
      <select
        value={rating}
        onChange={(e) => setRating(parseInt(e.target.value, 10))}
        style={{ padding: 6, fontSize: 12 }}
      >
        {[5, 4, 3, 2, 1, 0].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

      <label style={{ fontSize: 12 }}>Comment</label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional"
        style={{ padding: 6, fontSize: 12, height: 60, resize: "vertical" }}
      />

      <button
        type="submit"
        disabled={busy}
        style={{
          padding: "6px 10px",
          fontSize: 12,
          border: "1px solid #374151",
          background: busy ? "#6b7280" : "#1f2937",
          color: "#fff",
          borderRadius: 6,
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        Submit
      </button>
    </form>
  );
}

// ---------------- Page ----------------

export default function Model1HeatmapPage() {
  // Default view (London)
  const [center] = useState<[number, number]>(() => [51.5074, -0.1278]);

  // Bounds tracking: when map moves, we hit /api/sites?bbox=...
  const [bounds, setBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);

  // Data + UI
  const [rows, setRows] = useState<ReturnType<typeof normalize>[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // You asked for “proper points, no effect”, so show markers by default.
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Currently selected marker → opens the right panel
  const [selected, setSelected] = useState<ReturnType<typeof normalize> | null>(null);

  // Map ref
  const mapRef = useRef<any>(null);

  // Load data when bounds change
  useEffect(() => {
    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const base = getApiBase();
        let url: string;

        if (bounds) {
          const { north, south, east, west } = bounds;
          url = `${base}/api/sites?bbox=${west},${south},${east},${north}`;
        } else {
          // Fallback: center+radius via stations endpoint
          url = `${base}/api/stations?lat=${center[0]}&lon=${center[1]}&dist=25`;
        }

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const payload = await res.json();

        const list: any[] = Array.isArray(payload) ? payload : payload?.sites ?? [];
        const normalized = list
          .map(normalize)
          .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));

        setRows(normalized);
      } catch (e: any) {
        setErr(e?.message || "Failed to load");
        setRows([]);
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [bounds, center]);

  // Create simple circle icons for up/down status
  const [iconUp, iconDown, iconDefault] = useMemo(() => {
    if (typeof window === "undefined") return [undefined, undefined, undefined];
    const L = require("leaflet");
    const mk = (bg: string) =>
      L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${bg};border:2px solid white"></div>`,
        iconSize: [18, 18],
        className: "",
      });
    return [mk("#22c55e"), mk("#ef4444"), mk("#3b82f6")];
  }, []);

  // Heat points from scores (only used when heatmap is enabled)
  const heatPoints: HeatPoint[] = useMemo(() => {
    if (!rows.length) return [];
    const vals = rows.map((r) => r.score);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const denom = max - min || 1;
    return rows.map((r) => [r.lat, r.lon, Math.sqrt((r.score - min) / denom)] as HeatPoint);
  }, [rows]);

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      {/* Top left controls */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          zIndex: 1000,
          background: "rgba(12,19,38,0.9)",
          padding: 12,
          borderRadius: 8,
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition((pos) => {
                const { latitude, longitude } = pos.coords;
                mapRef.current?.setView([latitude, longitude], 13);
              });
            }}
            style={{ padding: "6px 10px", border: "1px solid #374151", background: "#1f2937", color: "#fff", borderRadius: 6 }}
          >
            Use my location
          </button>

          <button
            onClick={() => mapRef.current?.setView(center, 13)}
            style={{ padding: "6px 10px", border: "1px solid #374151", background: "#1f2937", color: "#fff", borderRadius: 6 }}
          >
            Reset view
          </button>

          <button
            onClick={() => setShowHeatmap((v) => !v)}
            style={{ padding: "6px 10px", border: "1px solid #374151", background: "#1f2937", color: "#fff", borderRadius: 6 }}
          >
            {showHeatmap ? "Markers" : "Heatmap"}
          </button>
        </div>
      </div>

      {/* Right details & feedback panel */}
      {selected && (
        <aside
          style={{
            position: "absolute",
            top: 80,
            right: 12,
            zIndex: 1000,
            width: 320,
            maxWidth: "40vw",
            background: "rgba(12,19,38,0.96)",
            color: "#fff",
            padding: 12,
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,.35)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{selected.name}</h3>
            <button
              onClick={() => setSelected(null)}
              style={{ background: "transparent", border: "1px solid #374151", color: "#fff", borderRadius: 6, padding: "0 8px" }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4 }}>
            {selected.postcode && <div>Postcode: {selected.postcode}</div>}
            {typeof selected.connectors === "number" && <div>Connectors: {selected.connectors}</div>}
            {typeof selected.maxPowerKw === "number" && <div>Max power: {selected.maxPowerKw} kW</div>}
            {selected.status && <div>Status: {selected.status === "up" ? "Operational" : "Not operational"}</div>}
            {selected.source && <div>Source: {selected.source === "ocm" ? "OpenChargeMap" : "Council"}</div>}
            <div>Score: {selected.score.toFixed(2)}</div>
          </div>

          <FeedbackForm
            stationId={selected.id ?? `${selected.lat},${selected.lon}`}
            onSubmitted={() => {
              // you could re-fetch here if you later record feedback server-side
            }}
          />
        </aside>
      )}

      {/* Map */}
      <main style={{ height: "100%", width: "100%" }}>
        <MapContainer
          center={center}
          zoom={13}
          scrollWheelZoom
          ref={mapRef}
          style={{ height: "100%", width: "100%" }}
          whenReady={() => {
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
            map.on("moveend", update);
            map.on("zoomend", update);
          }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Markers (default) */}
          {!showHeatmap &&
            rows.map((r) => {
              const icon =
                r.status == null ? iconDefault : r.status === "up" ? iconUp : iconDown;
              return (
                <Marker
                  key={`${r.id}-${r.lat}-${r.lon}`}
                  position={[r.lat, r.lon]}
                  icon={icon}
                  eventHandlers={{
                    click: () => setSelected(r),
                  }}
                />
              );
            })}
        </MapContainer>

        {/* Heatmap overlay when toggled on */}
        {showHeatmap && rows.length > 0 && (
          <HeatOverlay points={heatPoints} mapRef={mapRef} />
        )}

        {/* Empty state */}
        {!loading && !err && rows.length === 0 && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "rgba(0,0,0,0.65)",
              color: "#fff",
              padding: 14,
              borderRadius: 10,
              fontSize: 14,
            }}
          >
            No stations in view. Move or zoom the map.
          </div>
        )}
      </main>
    </div>
  );
}

// A tiny heat overlay component (kept separate for clarity)
function HeatOverlay({ points, mapRef }: { points: HeatPoint[]; mapRef: React.MutableRefObject<any>; }) {
  const layerRef = useRef<any>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = mapRef.current;
      if (!map) return;
      const L = (await import("leaflet")).default as any;
      await import("leaflet.heat");

      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
      if (cancelled || points.length === 0) return;

      const layer = (L as any).heatLayer(points, {
        radius: 45,
        blur: 25,
        maxZoom: 17,
        max: 1.0,
        minOpacity: 0.35,
      });
      layer.addTo(map);
      layerRef.current = layer;
    })();

    return () => {
      cancelled = true;
      const map = mapRef.current;
      if (layerRef.current && map) {
        try { map.removeLayer(layerRef.current); } catch {}
        layerRef.current = null;
      }
    };
  }, [points, mapRef]);
  return null;
}
