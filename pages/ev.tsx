// pages/ev.tsx
import React, { useEffect, useMemo } from "react";
import Head from "next/head";
import dynamic from "next/dynamic";
import InstallPrompt from "@/components/InstallPrompt";

// ───────────────────────────────────────────────────────────────────────────────
// React-Leaflet pieces (client-only to avoid SSR issues)
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
const LayersControl = dynamic(
  () => import("react-leaflet").then((m) => m.LayersControl),
  { ssr: false }
);

// ───────────────────────────────────────────────────────────────────────────────
// Service Worker registration (keep as-is; you already had this)
function registerSW() {
  if (typeof window === "undefined") return;
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.error("SW registration failed:", err));
    });
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Types & demo data (replace with your real data fetch later if you want)
type HeatPoint = [number, number, number]; // [lat, lng, intensity 0..1]

const DEMO_HEAT: HeatPoint[] = [
  // Central London cluster
  [51.5079, -0.1281, 0.9],
  [51.5070, -0.12, 0.8],
  [51.506, -0.11, 0.7],
  [51.51, -0.14, 0.8],
  [51.509, -0.132, 1.0],
  // Canary Wharf
  [51.505, -0.0235, 0.85],
  [51.502, -0.020, 0.7],
  // West London
  [51.514, -0.275, 0.6],
  [51.520, -0.30, 0.5],
  // South
  [51.45, -0.10, 0.55],
  [51.44, -0.12, 0.4],
];

const DEMO_MARKERS: Array<{ lat: number; lng: number; name: string }> = [
  { lat: 51.5074, lng: -0.1278, name: "Central London" },
  { lat: 51.505, lng: -0.0235, name: "Canary Wharf" },
  { lat: 51.514, lng: -0.275, name: "Ealing" },
];

// ───────────────────────────────────────────────────────────────────────────────
// Heatmap layer as a tiny React-Leaflet compatible component
// (leaflet.heat has no TS types; we lazy-load it on the client)
import { useMap } from "react-leaflet";
function HeatmapLayer({
  points,
  radius = 28,
  blur = 20,
  maxZoom = 17,
  gradient,
}: {
  points: HeatPoint[];
  radius?: number;
  blur?: number;
  maxZoom?: number;
  gradient?: Record<number, string>;
}) {
  const map = useMap();

  useEffect(() => {
    let heat: any;
    let mounted = true;
    (async () => {
      const L = (await import("leaflet")).default as any;
      await import("leaflet.heat"); // patches L.heatLayer
      if (!mounted) return;
      heat = (L as any).heatLayer(points, {
        radius,
        blur,
        maxZoom,
        gradient,
      });
      heat.addTo(map);
    })();

    return () => {
      mounted = false;
      if (heat) {
        try {
          map.removeLayer(heat);
        } catch {}
      }
    };
  }, [map, points, radius, blur, maxZoom, gradient]);

  return null;
}

// Legend UI
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

// ───────────────────────────────────────────────────────────────────────────────

export default function EVPage() {
  useEffect(() => {
    registerSW();
  }, []);

  const center: [number, number] = [51.5074, -0.1278]; // London

  // Same gradient used in Legend
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

        {/* Map area */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "80vh",
            maxHeight: "calc(100dvh - 64px)",
          }}
        >
          <MapContainer
            center={center}
            zoom={11}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="OpenStreetMap">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>

              <LayersControl.Overlay checked name="Heatmap">
                {/* Heatmap overlay */}
                <HeatmapLayer
                  points={DEMO_HEAT}
                  radius={28}
                  blur={20}
                  maxZoom={17}
                  gradient={gradient}
                />
              </LayersControl.Overlay>

              <LayersControl.Overlay name="Stations (demo)">
                <>
                  {DEMO_MARKERS.map((m) => (
                    <CircleMarker key={m.name} center={[m.lat, m.lng]} radius={8}>
                      <Popup>
                        <strong>{m.name}</strong>
                        <br />
                        Demo POI
                      </Popup>
                      <Tooltip>{m.name}</Tooltip>
                    </CircleMarker>
                  ))}
                </>
              </LayersControl.Overlay>
            </LayersControl>
          </MapContainer>

          {/* Heat legend (fixed overlay) */}
          <Legend />
        </div>
      </main>

      {/* PWA install banner at page root */}
      <InstallPrompt />
    </>
  );
}
