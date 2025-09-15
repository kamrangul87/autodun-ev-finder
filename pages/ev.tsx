// pages/ev.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import dynamic from "next/dynamic";
import InstallPrompt from "@/components/InstallPrompt"; // harmless with Plan A (no SW)

// Client-only React-Leaflet parts (avoid SSR touching leaflet)
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
const Popup = dynamic(
  () => import("react-leaflet").then((m) => m.Popup),
  { ssr: false }
);
const Tooltip = dynamic(
  () => import("react-leaflet").then((m) => m.Tooltip),
  { ssr: false }
);

// ───────────────────────────────────────────────────────────────────────────────
// Types and helpers
type HeatPoint = [number, number, number]; // [lat, lng, intensity 0..1]

function toNum(v: any): number | null {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

// Prefer first non-null value for a list of candidate keys
function pickFirst(obj: any, keys: string[]): number | null {
  for (const k of keys) {
    const n = toNum(obj?.[k]);
    if (n !== null) return n;
  }
  return null;
}

// Heuristic: likely keys
const LAT_KEYS = ["lat", "latitude", "y"];
const LON_KEYS = ["lon", "lng", "long", "longitude", "x"];
const W_KEYS = ["w", "weight", "intensity", "count", "value", "metric"];

// Parse JSON: either [[lat,lng,w], ...] or [{lat, lon, weight}, ...]
function parseJsonToHeat(json: any): HeatPoint[] | null {
  if (!Array.isArray(json) || json.length === 0) return null;

  // array of arrays?
  if (Array.isArray(json[0])) {
    const out: HeatPoint[] = [];
    for (const row of json as any[]) {
      const [a, b, c] = row as any[];
      const lat = toNum(a);
      const lng = toNum(b);
      const w = toNum(c);
      if (lat !== null && lng !== null) out.push([lat, lng, w ?? 1]);
    }
    return out.length ? out : null;
  }

  // array of objects?
  if (typeof json[0] === "object" && json[0] !== null) {
    const out: HeatPoint[] = [];
    for (const obj of json as any[]) {
      const lat = pickFirst(obj, LAT_KEYS);
      const lng = pickFirst(obj, LON_KEYS);
      const w = pickFirst(obj, W_KEYS) ?? 1; // default to 1
      if (lat !== null && lng !== null) out.push([lat, lng, w]);
    }
    return out.length ? out : null;
  }

  return null;
}

// Tiny CSV parser (simple, no quotes/commas inside fields).
function simpleCsvParse(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines.shift()!.split(",").map((h) => h.trim().toLowerCase());
  const rows = lines
    .filter((ln) => ln.trim().length)
    .map((ln) => ln.split(",").map((c) => c.trim()));
  return { headers, rows };
}

function parseCsvToHeat(csvText: string): HeatPoint[] | null {
  const { headers, rows } = simpleCsvParse(csvText);
  const latIdx = headers.findIndex((h) => LAT_KEYS.includes(h));
  const lonIdx = headers.findIndex((h) => LON_KEYS.includes(h));
  const wIdx = headers.findIndex((h) => W_KEYS.includes(h));
  if (latIdx === -1 || lonIdx === -1) return null;

  const out: HeatPoint[] = [];
  for (const r of rows) {
    const lat = toNum(r[latIdx]);
    const lng = toNum(r[lonIdx]);
    const w = wIdx !== -1 ? toNum(r[wIdx]) ?? 1 : 1;
    if (lat !== null && lng !== null) out.push([lat, lng, w]);
  }
  return out.length ? out : null;
}

function normalizeIntensity(points: HeatPoint[]): HeatPoint[] {
  // If weights already 0..1, keep as-is
  const ws = points.map((p) => p[2]);
  const min = Math.min(...ws);
  const max = Math.max(...ws);
  if (min >= 0 && max <= 1) return points;

  const range = max - min || 1;
  return points.map(([lat, lng, w]) => [lat, lng, (w - min) / range]);
}

// ───────────────────────────────────────────────────────────────────────────────
// Demo fallback data (used only if no real file found)
const DEMO_HEAT: HeatPoint[] = [
  [51.5079, -0.1281, 0.9],
  [51.507, -0.12, 0.8],
  [51.506, -0.11, 0.7],
  [51.51, -0.14, 0.8],
  [51.509, -0.132, 1.0],
  [51.505, -0.0235, 0.85],
  [51.502, -0.02, 0.7],
  [51.514, -0.275, 0.6],
  [51.52, -0.3, 0.5],
  [51.45, -0.1, 0.55],
  [51.44, -0.12, 0.4],
];

const DEMO_MARKERS: Array<{ lat: number; lng: number; name: string }> = [
  { lat: 51.5074, lng: -0.1278, name: "Central London" },
  { lat: 51.505, lng: -0.0235, name: "Canary Wharf" },
  { lat: 51.514, lng: -0.275, name: "Ealing" },
];

// ───────────────────────────────────────────────────────────────────────────────
// UI helpers
function Legend() {
  return (
    <div
      style={{
        position: "fixed",
        right: 14,
        bottom: 14,
        zIndex: 1000,
        background: "#0b1220",
        color: "#e6e8ee",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: "0 8px 20px rgba(0,0,0,.25)",
        width: 220,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
        Heat intensity
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 6,
          background:
            "linear-gradient(90deg, #2c7bb6 0%, #abd9e9 25%, #ffff8c 50%, #fdae61 75%, #d7191c 100%)",
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          marginTop: 4,
          opacity: 0.8,
        }}
      >
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}

function LayerToggles({
  showHeat,
  setShowHeat,
  showMarkers,
  setShowMarkers,
}: {
  showHeat: boolean;
  setShowHeat: (v: boolean) => void;
  showMarkers: boolean;
  setShowMarkers: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        right: 14,
        top: 78,
        zIndex: 1000,
        background: "#0b1220",
        color: "#e6e8ee",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: "0 8px 20px rgba(0,0,0,.25)",
        width: 220,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
        Layers
      </div>
      <label style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 6 }}>
        <input
          type="checkbox"
          checked={showHeat}
          onChange={(e) => setShowHeat(e.target.checked)}
        />
        Heatmap
      </label>
      <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={showMarkers}
          onChange={(e) => setShowMarkers(e.target.checked)}
        />
        Stations (demo)
      </label>
    </div>
  );
}

function MapButtons({
  onLocate,
  onReset,
  locating,
}: {
  onLocate: () => void;
  onReset: () => void;
  locating: boolean;
}) {
  const btn = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0b1220",
    color: "#e6e8ee",
    cursor: "pointer",
  } as const;

  return (
    <div
      style={{
        position: "fixed",
        left: 14,
        top: 78,
        zIndex: 1000,
        display: "flex",
        gap: 8,
      }}
    >
      <button style={btn} onClick={onLocate} disabled={locating}>
        {locating ? "Locating…" : "Use my location"}
      </button>
      <button style={btn} onClick={onReset}>
        Reset view
      </button>
    </div>
  );
}

function DataBadge({ source, count }: { source: string; count: number }) {
  return (
    <div
      style={{
        position: "fixed",
        left: 14,
        bottom: 14,
        zIndex: 1000,
        background: "#0b1220",
        color: "#e6e8ee",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        padding: "8px 10px",
        boxShadow: "0 8px 20px rgba(0,0,0,.25)",
      }}
    >
      <span style={{ opacity: 0.85, fontSize: 12 }}>
        Data: <strong>{source}</strong> · {count} points
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────

export default function EVPage() {
  // PLAN A: No service worker registration here
  const center: [number, number] = [51.5074, -0.1278]; // London

  const gradient = useMemo<Record<number, string>>(
    () => ({
      0.0: "#2c7bb6",
      0.25: "#abd9e9",
      0.5: "#ffff8c",
      0.75: "#fdae61",
      1.0: "#d7191c",
    }),
    []
  );

  const mapRef = useRef<any>(null);
  const [map, setMap] = useState<any | null>(null);
  const heatRef = useRef<any | null>(null);

  const [showHeat, setShowHeat] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);

  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);

  const [heatPoints, setHeatPoints] = useState<HeatPoint[] | null>(null);
  const [dataSource, setDataSource] = useState<string>("demo");

  // === Load REAL heat data if present ===
  useEffect(() => {
    let ignore = false;

    async function loadData() {
      // Try JSON first
      try {
        const r = await fetch("/data/ev_heat.json", { cache: "no-cache" });
        if (r.ok) {
          const j = await r.json();
          const arr = parseJsonToHeat(j);
          if (arr && arr.length) {
            const norm = normalizeIntensity(arr);
            if (!ignore) {
              setHeatPoints(norm);
              setDataSource("ev_heat.json");
            }
            return;
          }
        }
      } catch {}

      // Then try CSV
      try {
        const r = await fetch("/data/ev_heat.csv", { cache: "no-cache" });
        if (r.ok) {
          const text = await r.text();
          const arr = parseCsvToHeat(text);
          if (arr && arr.length) {
            const norm = normalizeIntensity(arr);
            if (!ignore) {
              setHeatPoints(norm);
              setDataSource("ev_heat.csv");
            }
            return;
          }
        }
      } catch {}

      // Fallback to demo
      if (!ignore) {
        setHeatPoints(DEMO_HEAT);
        setDataSource("demo");
      }
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, []);

  // Build/remove heat layer only in the browser
  useEffect(() => {
    let cancelled = false;

    async function mountHeat() {
      if (!map || !showHeat || !heatPoints) return;

      const L = (await import("leaflet")).default as any;
      await import("leaflet.heat"); // adds L.heatLayer

      if (cancelled) return;

      if (heatRef.current) {
        try {
          map.removeLayer(heatRef.current);
        } catch {}
        heatRef.current = null;
      }

      const layer = (L as any).heatLayer(heatPoints, {
        radius: 55,
        blur: 35,
        maxZoom: 17,
        max: 1.0,
        minOpacity: 0.35,
        gradient,
      });
      layer.addTo(map);
      heatRef.current = layer;
    }

    if (showHeat) {
      mountHeat();
    } else if (map && heatRef.current) {
      try {
        map.removeLayer(heatRef.current);
      } catch {}
      heatRef.current = null;
    }

    return () => {
      cancelled = true;
    };
  }, [map, showHeat, gradient, heatPoints]);

  // Locate me handler
  const handleLocate = () => {
    if (!map || !("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserPos([lat, lng]);
        try {
          map.flyTo([lat, lng], Math.max(13, map.getZoom() || 12), {
            animate: true,
            duration: 0.8,
          });
        } catch {}
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  // Reset view handler
  const handleReset = () => {
    if (!map) return;
    map.flyTo(center, 12, { animate: true, duration: 0.6 });
  };

  return (
    <>
      <Head>
        <title>EV | Autodun</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100dvh",
          background: "#0b1220",
          color: "#e6e8ee",
        }}
      >
        <header
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            Autodun EV Map
          </h1>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            Explore EV hotspots &amp; charging insights
          </div>
        </header>

        <div
          style={{
            position: "relative",
            width: "100%",
            height: "80vh",
            maxHeight: "calc(100dvh - 64px)",
          }}
        >
          <MapContainer
            ref={mapRef}
            center={center}
            zoom={12}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
            whenReady={() => setMap(mapRef.current)} // v4: no args
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Demo markers */}
            {showMarkers &&
              DEMO_MARKERS.map((m) => (
                <CircleMarker key={m.name} center={[m.lat, m.lng]} radius={8}>
                  <Popup>
                    <strong>{m.name}</strong>
                    <br />
                    Demo POI
                  </Popup>
                  <Tooltip>{m.name}</Tooltip>
                </CircleMarker>
              ))}

            {/* User location marker (if available) */}
            {userPos && (
              <CircleMarker center={userPos} radius={10} pathOptions={{ color: "#3b82f6" }}>
                <Popup>You are here</Popup>
              </CircleMarker>
            )}
          </MapContainer>

          {/* Overlays */}
          <LayerToggles
            showHeat={showHeat}
            setShowHeat={setShowHeat}
            showMarkers={showMarkers}
            setShowMarkers={setShowMarkers}
          />
          <MapButtons onLocate={handleLocate} onReset={handleReset} locating={locating} />
          <Legend />
          <DataBadge source={dataSource} count={heatPoints?.length ?? 0} />
        </div>
      </main>

      {/* PWA install banner is inert without SW; keeping is fine */}
      <InstallPrompt />
    </>
  );
}
