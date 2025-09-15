// pages/ev.tsx
import React, { useEffect } from "react";
import Head from "next/head";
import dynamic from "next/dynamic";
import InstallPrompt from "@/components/InstallPrompt";

// ---- Client-only react-leaflet pieces (avoid SSR) ----
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

// ---- Service worker registration (leave as is if you already have this) ----
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

export default function EVPage() {
  useEffect(() => {
    registerSW();
  }, []);

  const center: [number, number] = [51.5074, -0.1278]; // London

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

        {/* Give the map a HARD height so Leaflet paints for sure */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "80vh",          // <— explicit height
            maxHeight: "calc(100dvh - 64px)",
          }}
        >
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

      {/* PWA install banner */}
      <InstallPrompt />
    </>
  );
}
