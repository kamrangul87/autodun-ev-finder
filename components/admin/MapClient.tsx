// components/admin/MapClient.tsx
"use client";

import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";

export type FeedbackPoint = {
  id: string;
  stationName?: string;
  lat: number;
  lng: number;
  mlScore?: number;
  sentiment?: "positive" | "neutral" | "negative";
  source?: string;
  createdAt?: string;
};

// Fix default marker icons on client
if (typeof window !== "undefined") {
  // @ts-ignore
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

/* ───────── helpers ───────── */

function pinColor(s?: FeedbackPoint["sentiment"]) {
  if (s === "positive") return "#16a34a"; // green
  if (s === "negative") return "#dc2626"; // red
  if (s === "neutral") return "#6b7280";  // gray
  return "#2563eb";                       // unknown
}

function iconFor(s?: FeedbackPoint["sentiment"]) {
  const color = pinColor(s);
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="38" viewBox="0 0 26 38">
       <path d="M13 0C6 0 0.8 5.2 0.8 12.1c0 8.5 10.8 23 11.2 23.5.3.4.9.4 1.2 0 .4-.5 11.2-15 11.2-23.5C25.6 5.2 20.4 0 13 0z" fill="${color}"/>
       <circle cx="13" cy="12" r="6" fill="#fff"/>
     </svg>`
  );
  return L.icon({
    iconUrl: `data:image/svg+xml;utf8,${svg}`,
    iconSize: [26, 38],
    iconAnchor: [13, 38],
    tooltipAnchor: [0, -34],
  });
}

/** Imperative fit-to-bounds that runs when `trigger` changes */
function FitBounds({ points, trigger }: { points: FeedbackPoint[]; trigger: number }) {
  const map = useMap();
  React.useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], Math.max(map.getZoom(), 12), { animate: true });
      return;
    }
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number]));
    if (!bounds.isValid()) return;
    map.fitBounds(bounds.pad(0.2), { animate: true });
  }, [trigger, points, map]);
  return null;
}

function ScoreBadge({ value }: { value?: number }) {
  if (typeof value !== "number" || !isFinite(value)) return null;
  const s = Math.round(value);
  const tone =
    s >= 70
      ? { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" }
      : s >= 40
      ? { bg: "#fef9c3", text: "#854d0e", border: "#fde68a" }
      : { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      ML {s}
    </span>
  );
}

/* ───────── component ───────── */

export default function MapClient({
  points,
  fitToPointsKey = 0,
}: {
  points: FeedbackPoint[];
  fitToPointsKey?: number; // bump to trigger fit-to-results
}) {
  const center: [number, number] =
    points.length ? [points[0].lat, points[0].lng] : [52.3555, -1.1743]; // UK fallback

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <MapContainer center={center} zoom={6} scrollWheelZoom style={{ width: "100%", height: "100%" }}>
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Imperative fitter */}
        <FitBounds points={points} trigger={fitToPointsKey} />

        <MarkerClusterGroup chunkedLoading>
          {points.map((p) => (
            <Marker
              key={`${p.id}-${p.createdAt ?? ""}`}
              position={[p.lat, p.lng]}
              icon={iconFor(p.sentiment)}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 700 }}>{p.stationName ?? "Station"}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4, marginBottom: 4 }}>
                    <ScoreBadge value={p.mlScore} />
                    {p.sentiment && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid #e5e7eb",
                          background: "#f5f5f5",
                          textTransform: "capitalize",
                        }}
                      >
                        {p.sentiment}
                      </span>
                    )}
                  </div>
                  {p.source && <div>Source: {p.source}</div>}
                  {p.createdAt && <div style={{ opacity: 0.7 }}>{p.createdAt}</div>}
                </div>
              </Tooltip>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          right: 10,
          bottom: 10,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: "8px 10px",
          fontSize: 12,
          boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        }}
      >
        <LegendItem color="#16a34a" label="Positive" />
        <LegendItem color="#6b7280" label="Neutral" />
        <LegendItem color="#dc2626" label="Negative" />
        <LegendItem color="#2563eb" label="Unknown" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 999,
          background: color,
          display: "inline-block",
          border: "1px solid #e5e7eb",
        }}
      />
      <span>{label}</span>
    </div>
  );
}
