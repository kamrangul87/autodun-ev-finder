// components/admin/FeedbackMap.tsx
"use client";
import { MapContainer, TileLayer, Marker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useMemo } from "react";

export type FeedbackPoint = {
  id: string;
  stationName?: string;
  lat: number;
  lng: number;
  mlScore?: number;                 // 0–100
  sentiment?: "positive"|"neutral"|"negative";
  source?: string;
  createdAt?: string;               // ISO
};

if (typeof window !== "undefined") {
  // @ts-ignore
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

function scoreBadge(score?: number) {
  if (typeof score !== "number" || !isFinite(score)) return null;
  const s = Math.round(score);
  const tone =
    s >= 70 ? "bg-green-100 text-green-800 border-green-200" :
    s >= 40 ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
              "bg-red-100 text-red-800 border-red-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${tone}`}>
      ML {s}
    </span>
  );
}

export default function FeedbackMap({ points }: { points: FeedbackPoint[] }) {
  const center = useMemo<[number, number]>(() => {
    if (points?.length) return [points[0].lat, points[0].lng];
    return [52.3555, -1.1743]; // UK approx
  }, [points]);

  return (
    <div className="w-full h-[420px] rounded-2xl overflow-hidden border border-gray-200">
      <MapContainer center={center} zoom={6} scrollWheelZoom style={{ width: "100%", height: "100%" }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {points?.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]}>
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <div className="text-sm space-y-1">
                <div className="font-semibold">{p.stationName ?? "Station"}</div>
                <div className="flex items-center gap-2">
                  {scoreBadge(p.mlScore)}
                  {p.sentiment && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200">
                      {p.sentiment}
                    </span>
                  )}
                </div>
                {p.source && <div className="text-xs">Source: {p.source}</div>}
                {p.createdAt && <div className="text-xs opacity-70">{p.createdAt}</div>}
              </div>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
