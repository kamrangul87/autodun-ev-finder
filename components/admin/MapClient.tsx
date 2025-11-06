// components/admin/MapClient.tsx
"use client";

import { MapContainer, TileLayer, Marker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

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
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
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

export default function MapClient({ points }: { points: FeedbackPoint[] }) {
  const center: [number, number] =
    points.length ? [points[0].lat, points[0].lng] : [52.3555, -1.1743];

  return (
    <MapContainer center={center} zoom={6} scrollWheelZoom style={{ width: "100%", height: "100%" }}>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]}>
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
    </MapContainer>
  );
}
