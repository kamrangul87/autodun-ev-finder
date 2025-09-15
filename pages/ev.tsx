// pages/ev.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import dynamic from "next/dynamic";
import InstallPrompt from "@/components/InstallPrompt";

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

// ---- Service worker registration (fixed) ----
function registerSW() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const url = "/sw-v4.js"; // new filename to bust old workers

  navigator.serviceWorker
    .register(url, { scope: "/" })
    .then((reg) => {
      // check for updates
      try {
        reg.update();
      } catch {}
      // auto-reload once when the new worker takes control
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    })
    .catch((err) => {
      console.error("SW registration failed:", err);
    });
}

// ---- Demo data (replace with real dataset later) ----
type HeatPoint = [number, number, number]; // [lat, lng, intensity 0..1]

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

// ---- Legend ----
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

// ---- Simple toggles UI ----
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

export default function EVPage() {
  useEffect(() => {
    registerSW();
  }, []);

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

  // Build/remove heat layer only in the browser
  useEffect(() => {
    let cancelled = false;

    async function mountHeat() {
      if (!map || !showHeat) return;

      const L = (await import("leaflet")).default as any;
      await import("leaflet.heat"); // adds L.heatLayer

      if (cancelled) return;

      if (heatRef.current) {
        try {
          map.removeLayer(heatRef.current);
        } catch {}
        heatRef.current = null;
      }

      const layer = (L as any).heatLayer(DEMO_HEAT, {
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
  }, [map, showHeat, gradient]);

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
          </MapContainer>

          <LayerToggles
            showHeat={showHeat}
            setShowHeat={setShowHeat}
            showMarkers={showMarkers}
            setShowMarkers={setShowMarkers}
          />
          <Legend />
        </div>
      </main>

      {/* PWA install banner */}
      <InstallPrompt />
    </>
  );
}
