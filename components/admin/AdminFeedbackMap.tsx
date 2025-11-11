"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Lazy-load Leaflet bits (avoids SSR issues)
const MapContainer = dynamic(
  async () => (await import("react-leaflet")).MapContainer,
  { ssr: false }
);
const TileLayer = dynamic(async () => (await import("react-leaflet")).TileLayer, { ssr: false });
const Polygon = dynamic(async () => (await import("react-leaflet")).Polygon, { ssr: false });
const Marker = dynamic(async () => (await import("react-leaflet")).Marker, { ssr: false });
const Popup = dynamic(async () => (await import("react-leaflet")).Popup, { ssr: false });

// Minimal local Supabase client to avoid touching existing files
import { createClient } from "@supabase/supabase-js";

type CouncilPolygon = {
  id: string | number;
  name?: string;
  // expecting standard GeoJSON-like coordinates (MultiPolygon or Polygon)
  coordinates: number[][][] | number[][][][]; 
};

type CouncilCentroid = {
  id: string | number;
  name?: string;
  lat: number;
  lng: number;
};

type FeedbackPoint = {
  id: string | number;
  lat: number | null;
  lng: number | null;
  created_at?: string;
  meta?: any;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseAnon
    ? createClient(supabaseUrl, supabaseAnon)
    : null;

function normalizePolygonCoords(coords: any): number[][][] {
  // Accepts Polygon or MultiPolygon and returns array of rings (latlng tuples)
  // Input is [lng,lat] from GeoJSON; flip to [lat,lng] for Leaflet.
  if (!coords) return [];
  const asPolygon = Array.isArray(coords[0][0][0]) ? coords : [coords]; // if Polygon -> wrap
  const rings: number[][][] = [];
  for (const poly of asPolygon) {
    // outer ring only for render simplicity (non-breaking; can add holes later)
    const outer = poly[0].map((p: number[]) => [p[1], p[0]]);
    rings.push(outer);
  }
  return rings;
}

export default function AdminFeedbackMap() {
  const [polygons, setPolygons] = useState<CouncilPolygon[]>([]);
  const [centroids, setCentroids] = useState<CouncilCentroid[]>([]);
  const [feedback, setFeedback] = useState<FeedbackPoint[]>([]);
  const [rtActive, setRtActive] = useState<boolean>(false);

  // Initial UK-ish view
  const center = useMemo(() => ({ lat: 52.3555, lng: -1.1743 }), []);

  // Fetch polygons once (cached by Next/Vercel at edge if you already set it)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/council", { cache: "no-store" });
        const data = await r.json();
        if (cancelled) return;
        // Expecting { items: [{ id, name, geometry: { coordinates }}] } or similar
        const items = (data?.items || data || []).map((it: any) => ({
          id: it.id ?? it.code ?? it.objectid ?? crypto.randomUUID(),
          name: it.name ?? it.council ?? itLA ?? "Council",
          coordinates: it?.geometry?.coordinates ?? it?.coordinates,
        }));
        setPolygons(items);
      } catch (e) {
        console.warn("Failed to load council polygons", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch centroids once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/council?mode=point", { cache: "no-store" });
        const data = await r.json();
        if (cancelled) return;
        // Expecting { items: [{ id, name, lat, lng }] }
        const items = (data?.items || data || []).map((it: any) => ({
          id: it.id ?? it.code ?? crypto.randomUUID(),
          name: it.name ?? "Council",
          lat: Number(it.lat),
          lng: Number(it.lng),
        })).filter((d: any) => Number.isFinite(d.lat) && Number.isFinite(d.lng));
        setCentroids(items);
      } catch (e) {
        console.warn("Failed to load council centroids", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load recent feedback (optional – you can replace with /api endpoint if you prefer)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // You can swap to your existing API if you have one; keeping this UI-only:
        const res = await fetch("/api/feedback?limit=500", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const items = (data?.items || data || []).map((f: any) => ({
          id: f.id ?? crypto.randomUUID(),
          lat: f.lat ?? f.latitude ?? null,
          lng: f.lng ?? f.longitude ?? null,
          created_at: f.created_at,
          meta: f,
        }));
        setFeedback(items.filter((f: FeedbackPoint) => f.lat && f.lng));
      } catch (e) {
        // Silent: /api/feedback may not exist; realtime will still work
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Supabase realtime for `feedback` + `council_centroids_live`
  useEffect(() => {
    if (!supabase) {
      console.warn("Supabase env not set; skipping realtime");
      return;
    }
    setRtActive(true);

    const channel = supabase
      .channel("admin-feedback-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feedback" },
        (payload: any) => {
          const row = payload?.new ?? payload?.record ?? null;
          if (!row) return;
          if (row.lat && row.lng) {
            setFeedback((prev) => {
              const idx = prev.findIndex((p) => String(p.id) === String(row.id));
              const next = { id: row.id, lat: row.lat, lng: row.lng, created_at: row.created_at, meta: row };
              if (idx >= 0) {
                const copy = prev.slice();
                copy[idx] = next;
                return copy;
              }
              return [next, ...prev];
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "council_centroids_live" },
        (payload: any) => {
          const row = payload?.new ?? payload?.record ?? null;
          if (!row) return;
          if (Number.isFinite(row.lat) && Number.isFinite(row.lng)) {
            setCentroids((prev) => {
              const idx = prev.findIndex((p) => String(p.id) === String(row.id));
              const next = { id: row.id, name: row.name ?? "Council", lat: Number(row.lat), lng: Number(row.lng) };
              if (idx >= 0) {
                const copy = prev.slice();
                copy[idx] = next;
                return copy;
              }
              return [next, ...prev];
            });
          }
        }
      )
      .subscribe((status) => {
        // status: SUBSCRIBED | CLOSED | TIMED_OUT | CHANNEL_ERROR
      });

    return () => {
      supabase.removeChannel(channel);
      setRtActive(false);
    };
  }, []);

  // Basic default icon (Leaflet CDN images)
  useEffect(() => {
    (async () => {
      const L = await import("leaflet");
      // @ts-ignore
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
    })();
  }, []);

  return (
    <div className="w-full h-[70vh] rounded-2xl overflow-hidden border">
      <div className="flex items-center justify-between px-3 py-2 text-sm border-b">
        <span className="font-medium">Council Map</span>
        <span className={`px-2 py-0.5 rounded-full text-xs ${rtActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
          {rtActive ? "Realtime ON" : "Realtime OFF"}
        </span>
      </div>

      <MapContainer
        center={[center.lat, center.lng]}
        zoom={6}
        style={{ height: "calc(70vh - 40px)", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Council polygons */}
        {polygons.map((p) => {
          const rings = normalizePolygonCoords(p.coordinates);
          return rings.map((ring, idx) => (
            <Polygon key={`${p.id}-${idx}`} positions={ring} pathOptions={{ weight: 1, opacity: 0.6 }} />
          ));
        })}

        {/* Council centroid markers */}
        {centroids.map((c) => (
          <Marker key={`c-${c.id}`} position={[c.lat, c.lng]}>
            <Popup>
              <div className="text-sm">
                <div className="font-medium">{c.name || "Council"}</div>
                <div>Lat: {c.lat.toFixed(5)}, Lng: {c.lng.toFixed(5)}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Feedback markers (if lat/lng present) */}
        {feedback.map((f) =>
          f.lat && f.lng ? (
            <Marker key={`f-${f.id}`} position={[Number(f.lat), Number(f.lng)]}>
              <Popup>
                <div className="text-sm">
                  <div className="font-medium">Feedback</div>
                  {f.created_at && <div className="opacity-70">{new Date(f.created_at).toLocaleString()}</div>}
                </div>
              </Popup>
            </Marker>
          ) : null
        )}
      </MapContainer>
    </div>
  );
}
