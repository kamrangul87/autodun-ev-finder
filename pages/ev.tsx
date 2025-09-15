// pages/ev.tsx
import React, { useEffect } from "react";
import Head from "next/head";
import dynamic from "next/dynamic";
import InstallPrompt from "@/components/InstallPrompt";

// Leaflet CSS (safe to import in Next.js pages)
import "leaflet/dist/leaflet.css";

// ---- Client-only react-leaflet components (avoid SSR issues) ----
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

// ---- Service worker registration (you already had this; included here) ----
function registerSW() {
  if (typeof window === "undefined") return;
  if ("serviceWorker" in navigator) {
    // Optional: remove 'load' listener if you prefer immediate registration.
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.error("SW registration failed:", err));
    });
  }
}

export default function EVPage() {
  useEffect(() => {
    registerSW();
  }, []);

  // Example map center: London (change as you like)
  const center: [number, number] = [51.5074, -0.1278];

  return (
    <>
      <Head>
        <title>EV | Autodun</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* manifest is already linked in _document.tsx */}
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
        {/* Top bar / filters (placeholder) */}
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
            Explore EV hotspots & charging insights
          </div>
        </header>

        {/* Map area */}
        <div
          style={{
            position: "relative",
            flex: 1,
            // Give the map a height on mobile; 100dvh minus header estimate
            minHeight: "calc(100dvh - 60px)",
          }}
        >
          {/* Only renders client-side */}
          <MapContainer
            center={center}
            zoom={11}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Example marker (replace with your real points/heatmap layers) */}
            <CircleMarker center={center} radius={10}>
              <Popup>
                <strong>Central London</strong>
                <br />
                Example point for demo.
              </Popup>
              <Tooltip>Example marker</Tooltip>
            </CircleMarker>
          </MapContainer>
        </div>
      </main>

      {/* 👉 Install prompt should live at page root so its fixed banner overlays everything */}
      <InstallPrompt />
    </>
  );
}
