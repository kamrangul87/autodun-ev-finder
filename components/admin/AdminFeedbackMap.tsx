"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@supabase/supabase-js";
import type { LatLngTuple } from "leaflet";

// ➕ Council badge (already in components/admin)
import CouncilBadge from "./CouncilBadge";

// Lazy-load Leaflet parts to avoid SSR issues
const MapContainer = dynamic(
  async () => (await import("react-leaflet")).MapContainer,
  { ssr: false }
);
const TileLayer = dynamic(async () => (await import("react-leaflet")).TileLayer, { ssr: false });
const Polygon = dynamic(async () => (await import("react-leaflet")).Polygon, { ssr: false });
const Marker = dynamic(async () => (await import("react-leaflet")).Marker, { ssr: false });
const Popup = dynamic(async () => (await import("react-leaflet")).Popup, { ssr: false });

type CouncilPolygon = {
  id: string | number;
  name?: string;
  // GeoJSON: Polygon | MultiPolygon
  coordinates: any;
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

// Supabase client (UI-only; no contract changes)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseAnon ? createClient(supabaseUrl, supabaseAnon) : null;

// Safe id generator for Node 20 + browser
const uid = () => {
  try {
    // @ts-ignore
    if (typeof crypto !== "undefined" && crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return Math.random().toString(36).slice(2);
};

// A “ring” is an array of [lat,lng] tuples
type Ring = LatLngTuple[];

/**
 * normalizePolygonCoords
 * Accepts GeoJSON Polygon or MultiPolygon:
 *   - GeoJSON coords are [lng,lat]; Leaflet needs [lat,lng]
 * Returns: array of outer rings (LatLngTuple[])
 */
function normalizePolygonCoords(coords: any): Ring[] {
  if (!coords) return [];
  // If Polygon -> wrap to MultiPolygon shape for uniform handling
  const asMulti = Array.isArray(coords?.[0]?.[0]?.[0]) ? coords : [coords];

  const rings: Ring[] = [];
  for (const poly of asMulti) {
    const outerRaw = poly?.[0];
    if (!Array.isArray(outerRaw)) continue;

    const outer: Ring = outerRaw
      .filter((p: any) => Array.isArray(p) && p.length >= 2)
      .map((p: number[]): LatLngTuple => [p[1], p[0]] as LatLngTuple);

    if (outer.length >= 3) rings.push(outer);
  }
  return rings;
}

export default function AdminFeedbackMap() {
  const [polygons, setPolygons] = useState<CouncilPolygon[]>([]);
  const [centroids, setCentroids] = useState<CouncilCentroid[]>([]);
  const [feedback, setFeedback] = useState<FeedbackPoint[]>([]);
  const [rtActive, setRtActive] = useState<boolean>(false);

  // Initial UK view
  const center = useMemo(() => ({ lat: 52.3555, lng: -1.1743 }), []);

  // Load council polygons
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/council", { cache: "no-store" });
        const data = await r.json();

        if (cancelled) return;

        const items = (data?.items || data || [])
          .map((it: any) => ({
            id:
              it?.id ??
              it?.code ??
              it?.objectid ??
              it?.gss_code ??
              uid(),
            name:
              it?.name ??
              it?.council ??
              it?.la ??
              it?.LA ??
              it?.local_authority ??
              "Council",
            coordinates: it?.geometry?.coordinates ?? it?.coordinates ?? null,
          }))
          .filter((it: any) => Array.isArray(it.coordinates));

        setPolygons(items);
      } catch (e) {
        console.warn("Failed to load council polygons", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load council centroids
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/council?mode=point", { cache: "no-store" });
        const data = await r.json();

        if (cancelled) return;

        const items = (data?.items || data || [])
          .map((it: any) => ({
            id: it?.id ?? it?.code ?? uid(),
            name: it?.name ?? "Council",
            lat: Number(it?.lat),
            lng: Number(it?.lng),
          }))
          .filter((d: any) => Number.isFinite(d.lat) && Number.isFinite(d.lng));

        setCentroids(items);
      } catch (e) {
        console.warn("Failed to load council centroids", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Optional initial feedback (realtime will update after)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/feedback?limit=500", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();

        if (cancelled) return;

        const items = (data?.items || data || []).map((f: any) => ({
          id: f?.id ?? uid(),
          lat: f?.lat ?? f?.latitude ?? null,
          lng: f?.lng ?? f?.longitude ?? null,
          created_at: f?.created_at,
          meta: f,
        }));
        setFeedback(items.filter((f: FeedbackPoint) => f.lat && f.lng));
      } catch {
        // Silently ignore if /api/feedback is not present
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Supabase realtime: feedback + council_centroids_live
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
              const next: FeedbackPoint = {
                id: row.id ?? uid(),
                lat: Number(row.lat),
                lng: Number(row.lng),
                created_at: row.created_at,
                meta: row,
              };
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
              const next: CouncilCentroid = {
                id: row.id ?? uid(),
                name: row.name ?? "Council",
                lat: Number(row.lat),
                lng: Number(row.lng),
              };
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      setRtActive(false);
    };
  }, []);

  // Configure Leaflet default icons in browser
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
        <span
          className={`px-2 py-0.5 rounded-full text-xs ${
            rtActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
          }`}
        >
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
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Council polygons */}
        {polygons.map((p) => {
          const rings = normalizePolygonCoords(p.coordinates);
          return rings.map((ring, idx) => (
            <Polygon
              key={`${p.id}-${idx}`}
              positions={ring} // Ring = LatLngTuple[] — exactly what Polygon expects
              pathOptions={{ weight: 1, opacity: 0.6 }}
            />
          ));
        })}

        {/* Council centroid markers */}
        {centroids.map((c) => (
          <Marker key={`c-${c.id}`} position={[c.lat, c.lng]}>
            <Popup>
              <div className="text-sm space-y-1">
                <div className="font-medium">{c.name || "Council"}</div>
                <div>Lat: {c.lat.toFixed(5)}, Lng: {c.lng.toFixed(5)}</div>
                {/* ➕ Show resolved council (keeps UX consistent / future-proof) */}
                <CouncilBadge lat={c.lat} lng={c.lng} />
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Feedback markers (if lat/lng present) */}
        {feedback.map((f) =>
          f.lat && f.lng ? (
            <Marker key={`f-${f.id}`} position={[Number(f.lat), Number(f.lng)]}>
              <Popup>
                <div className="text-sm space-y-1">
                  <div className="font-medium">Feedback</div>
                  {f.created_at && (
                    <div className="opacity-70">
                      {new Date(f.created_at).toLocaleString()}
                    </div>
                  )}
                  {/* ➕ Show council for this feedback location */}
                  <CouncilBadge lat={Number(f.lat)} lng={Number(f.lng)} />
                </div>
              </Popup>
            </Marker>
          ) : null
        )}
      </MapContainer>
    </div>
  );
}
