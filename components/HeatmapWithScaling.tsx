'use client';

import React, { useMemo, useState, useEffect } from "react";
import { MapContainer, TileLayer, useMap, CircleMarker, Tooltip } from "react-leaflet";
import L from "leaflet"; // plugin is loaded dynamically

type Point = { lat: number; lng: number; value: number };

// ---------------- A) SCALING HELPERS ----------------
function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

function quantile(arr: number[], q: number) {
  if (arr.length === 0) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const pos = (a.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (a[base + 1] !== undefined) return a[base] + rest * (a[base + 1] - a[base]);
  return a[base];
}

type ScaleMethod = "linear" | "log" | "robust";
function scale(values: number[], method: ScaleMethod) {
  if (values.length === 0) return { scaled: [] as number[], domain: [0, 1] as [number, number] };

  if (method === "robust") {
    const p10 = quantile(values, 0.10);
    const p90 = quantile(values, 0.90);
    const denom = p90 - p10 || 1;
    return { scaled: values.map(v => clamp01((v - p10) / denom)), domain: [p10, p90] as [number, number] };
  }

  if (method === "log") {
    const max = Math.max(...values, 0);
    const denom = Math.log1p(max) || 1;
    return { scaled: values.map(v => clamp01(Math.log1p(Math.max(0, v)) / denom)), domain: [0, max] as [number, number] };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const denom = max - min || 1;
  return { scaled: values.map(v => clamp01((v - min) / denom)), domain: [min, max] as [number, number] };
}

// ---------------- B) GRADIENTS ----------------
type GradientName = "viridis" | "turbo" | "fire" | "blueRed";
function gradientStops(name: GradientName) {
  switch (name) {
    case "viridis": return { 0.0: "#440154", 0.25: "#31688E", 0.5: "#35B779", 0.75: "#FDE725", 1.0: "#FFFFE5" };
    case "turbo":   return { 0.0: "#30123B", 0.25: "#1F9E89", 0.5: "#73D055", 0.75: "#FDE725", 1.0: "#FAE61E" };
    case "fire":    return { 0.0: "#000004", 0.25: "#2C105C", 0.5: "#B63679", 0.75: "#FC8961", 1.0: "#F0F921" };
    case "blueRed": return { 0.0: "#08306B", 0.25: "#2171B5", 0.5: "#6BAED6", 0.75: "#FDAE6B", 1.0: "#CB181D" };
  }
}

// ---------------- C) Dynamic radius by zoom (stable when zooming) ----------------
function DynamicRadius({ setRadius }: { setRadius: (r: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const update = () => {
      const z = map.getZoom();
      // keep a decent minimum so zoomed-in heat doesn’t vanish
      const r = Math.max(20, 40 - (z - 7) * 4);
      setRadius(r);
    };
    map.on("zoomend", update);
    update();
    return () => { map.off("zoomend", update); };
  }, [map, setRadius]);
  return null;
}

// ---- Fit the map to the loaded points (run only once) ----
function FitBoundsOnce({ heatPoints }: { heatPoints: [number, number, number][] }) {
  const map = useMap();
  const didFit = React.useRef(false);

  useEffect(() => {
    if (didFit.current || !heatPoints || heatPoints.length === 0) return;
    const latLngs = heatPoints.map(([lat, lng]) => L.latLng(lat, lng));
    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [40, 40] });
    didFit.current = true;
  }, [map, heatPoints]);

  return null;
}

// ---------------- D) Heat layer wrapper (no viewport filtering) ----------------
function HeatLayer({
  heatPoints, radius, blur, gradient
}: {
  heatPoints: [number, number, number][],
  radius: number,
  blur: number,
  gradient: Record<number, string>,
}) {
  const map = useMap();
  const layerRef = React.useRef<any>(null);

  // mount once
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await import("leaflet.heat");
        if (!mounted) return;
        layerRef.current = (L as any).heatLayer(heatPoints, {
          radius,
          blur,
          max: 1.0,          // allow strong peaks
          gradient,
          minOpacity: 0.20   // keep visible at zoom
        });
        layerRef.current.addTo(map).bringToFront();
      } catch (e) {
        console.error("Failed to load leaflet.heat", e);
      }
    })();

    return () => {
      mounted = false;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map]);

  // update on changes (always use all points)
  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.setOptions({
      radius,
      blur,
      max: 1.0,
      gradient,
      minOpacity: 0.20
    });
    layerRef.current.setLatLngs(heatPoints);
    layerRef.current.redraw();
  }, [heatPoints, radius, blur, gradient]);

  return null;
}

// ---------------- E) HOTSPOTS OVERLAY (top ~3% in view) ----------------
function HotspotsOverlay({ points }: { points: Point[] }) {
  const map = useMap();
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);

  // track current map view
  useEffect(() => {
    const update = () => setBounds(map.getBounds());
    update();
    map.on("moveend", update);
    map.on("zoomend", update);
    return () => {
      map.off("moveend", update);
      map.off("zoomend", update);
    };
  }, [map]);

  const topPoints = useMemo(() => {
    const inView = bounds
      ? points.filter(p => bounds.contains(L.latLng(p.lat, p.lng)))
      : points;

    if (inView.length === 0) return [];

    const values = inView.map(p => p.value);
    const threshold = quantile(values, 0.97); // top 3%
    // cap to avoid too many markers
    return inView.filter(p => p.value >= threshold).slice(0, 60);
  }, [bounds, points]);

  return (
    <>
      {topPoints.map((p, i) => (
        <CircleMarker
          key={`${p.lat}-${p.lng}-${i}`}
          center={[p.lat, p.lng]}
          radius={8}
          pathOptions={{ color: "#ff3b3b", weight: 2, fillOpacity: 0.6 }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
            <div style={{ fontSize: 12 }}>
              <div><b>Hotspot</b></div>
              <div>Score: {p.value.toFixed(2)}</div>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

// ---------------- F) MAIN ----------------
export default function HeatmapWithScaling({
  points,
  defaultScale = "robust",
  palette = "fire",
}: {
  points: Point[];
  defaultScale?: ScaleMethod;
  palette?: GradientName;
}) {
  const [scaleMethod, setScaleMethod] = useState<ScaleMethod>(defaultScale);
  const [radius, setRadius] = useState<number>(60); // initial; DynamicRadius will adjust
  const [blur, setBlur] = useState<number>(35);

  const center = points.length
    ? { lat: points[0].lat, lng: points[0].lng }
    : { lat: 51.5074, lng: -0.1278 };

  const { scaled, domain } = useMemo(() => {
    const vals = points.map(p => p.value ?? 0);
    return scale(vals, scaleMethod);
  }, [points, scaleMethod]);

  // Bright peaks + low baseline to avoid blanket
  const heatData = useMemo(() => {
    const gamma = 0.55;     // < 1 = brighter highlights
    const baseline = 0.05;  // lower floor so weak areas fade out
    return points.map((p, i) => {
      const s = scaled[i] ?? 0;
      const w = baseline + (1 - baseline) * Math.pow(s, gamma); // 0.05..1
      return [p.lat, p.lng, w] as [number, number, number];
    });
  }, [points, scaled]);

  const gradient = useMemo(() => gradientStops(palette), [palette]);

  const controlsBox: React.CSSProperties = {
    position: "absolute",
    top: 12,
    left: 12,
    background: "rgba(255,255,255,0.9)",
    padding: 12,
    borderRadius: 12,
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
    fontSize: 14,
    zIndex: 1000,
  };

  return (
    <div className="relative w-full" style={{ height: "80vh", position: "relative" }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={7}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <DynamicRadius setRadius={setRadius} />
        <FitBoundsOnce heatPoints={heatData} />
        <HeatLayer heatPoints={heatData} radius={radius} blur={blur} gradient={gradient} />
        {/* Hotspots on top of the heat */}
        <HotspotsOverlay points={points} />
      </MapContainer>

      {/* Controls */}
      <div style={controlsBox}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Heatmap Settings</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label>Scale:</label>
          <select value={scaleMethod} onChange={e => setScaleMethod(e.target.value as ScaleMethod)}>
            <option value="robust">Robust (p10–p90)</option>
            <option value="linear">Linear</option>
            <option value="log">Log</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <label>Radius:</label>
          <input type="range" min={6} max={60} value={radius} onChange={e => setRadius(+e.target.value)} />
          <span>{radius}px</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <label>Blur:</label>
          <input type="range" min={5} max={40} value={blur} onChange={e => setBlur(+e.target.value)} />
          <span>{blur}px</span>
        </div>
      </div>

      {/* Legend */}
      <Legend domain={domain} palette={palette} />
    </div>
  );
}

// ---------------- G) LEGEND ----------------
function Legend({ domain, palette }: { domain: [number, number]; palette: GradientName }) {
  const grad = gradientStops(palette);
  const gradientCSS = `linear-gradient(to right, ${Object.entries(grad)
    .map(([k, color]) => `${color} ${Number(k) * 100}%`)
    .join(", ")})`;

  const legendBox: React.CSSProperties = {
    position: "absolute",
    bottom: 12,
    left: 12,
    background: "rgba(255,255,255,0.9)",
    padding: 12,
    borderRadius: 12,
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
    fontSize: 12,
    zIndex: 1000,
    width: 240,
  };

  return (
    <div style={legendBox}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Intensity</div>
      <div style={{ width: "100%", height: 10, background: gradientCSS, borderRadius: 6 }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span>{formatNumber(domain[0])}</span>
        <span>{formatNumber(domain[1])}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, opacity: 0.8 }}>
        Red circles = top ~3% hotspots in view
      </div>
    </div>
  );
}

function formatNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  if (n > 0) return n.toFixed(2);
  return "0";
}
