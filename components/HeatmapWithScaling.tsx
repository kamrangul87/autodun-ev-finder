'use client';

import React, { useMemo, useState, useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet"; // do not import 'leaflet.heat' here; we load it dynamically

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

// ---------------- C) Dynamic radius by zoom ----------------
function DynamicRadius({ setRadius }: { setRadius: (r: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const update = () => {
      const z = map.getZoom();
      const r = Math.max(8, 60 - (z - 7) * 6);
      setRadius(r);
    };
    map.on("zoomend", update);
    update();
    return () => { map.off("zoomend", update); };
  }, [map, setRadius]);
  return null;
}

// ---------------- D) Heat layer wrapper (dynamic plugin) ----------------
function HeatLayer({
  heatPoints, radius, blur, gradient, max
}: {
  heatPoints: [number, number, number][],
  radius: number,
  blur: number,
  gradient: Record<number, string>,
  max: number
}) {
  const map = useMap();

  useEffect(() => {
    let layer: any;
    let mounted = true;

    (async () => {
      try {
        await import("leaflet.heat"); // attach plugin
        if (!mounted) return;
        layer = (L as any).heatLayer(heatPoints, { radius, blur, max, gradient });
        layer.addTo(map);
      } catch (e) {
        console.error("Failed to load leaflet.heat", e);
      }
    })();

    return () => { mounted = false; if (layer) map.removeLayer(layer); };
  }, [map]);

  // Update layer options/data on prop changes
  useEffect(() => {
    // Find the first heat layer on map and update it
    // (Assumes only one heat layer in this component)
    map.eachLayer((lyr: any) => {
      if (lyr && typeof (lyr as any)._heat === "object") {
        (lyr as any).setOptions({ radius, blur, max, gradient });
        (lyr as any).setLatLngs(heatPoints.map(p => [p[0], p[1], p[2]]));
      }
    });
  }, [map, heatPoints, radius, blur, max, gradient]);

  return null;
}

// ---------------- E) MAIN ----------------
export default function HeatmapWithScaling({
  points,
  defaultScale = "robust",
  palette = "fire",            // punchier palette
}: {
  points: Point[];
  defaultScale?: ScaleMethod;
  palette?: GradientName;
}) {
  const [scaleMethod, setScaleMethod] = useState<ScaleMethod>(defaultScale);
  const [radius, setRadius] = useState<number>(60); // stronger defaults;
  const [blur, setBlur] = useState<number>(35);     // stronger defaults;

  const center = points.length
    ? { lat: points[0].lat, lng: points[0].lng }
    : { lat: 51.5074, lng: -0.1278 }; // London fallback

  const { scaled, domain } = useMemo(() => {
    const vals = points.map(p => p.value ?? 0);
    return scale(vals, scaleMethod);
  }, [points, scaleMethod]);

  const heatData = useMemo(() => {
  const gamma = 0.65; // < 1 brightens; > 1 darkens
  return points.map((p, i) => {
    const w = Math.pow(scaled[i] ?? 0, gamma);
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
        <HeatLayer heatPoints={heatData} radius={radius} blur={blur} max={1} gradient={gradient} />
      </MapContainer>

      {/* Controls (always visible) */}
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
          <input type="range" min={8} max={60} value={radius} onChange={e => setRadius(+e.target.value)} />
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

// ---------------- F) LEGEND ----------------
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
