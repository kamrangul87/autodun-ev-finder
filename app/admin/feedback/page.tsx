// app/admin/feedback/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, RefreshCw } from "lucide-react";

// --- Leaflet (client-only) ---
const MapContainer = dynamic(
  async () => (await import("react-leaflet")).MapContainer,
  { ssr: false }
);
const TileLayer = dynamic(async () => (await import("react-leaflet")).TileLayer, {
  ssr: false,
});
const Marker = dynamic(async () => (await import("react-leaflet")).Marker, {
  ssr: false,
});
const Popup = dynamic(async () => (await import("react-leaflet")).Popup, {
  ssr: false,
});

// Leaflet icon fix for Next.js
import L from "leaflet";
if (typeof window !== "undefined") {
  // @ts-ignore
  delete (L.Icon.Default as any).prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

/*
  ──────────────────────────────────────────────────────────────────────────────
  Admin Feedback Dashboard — Map + Charts (MVP polish: Step 1/6)
  - NON‑BREAKING: Uses existing GET /api/feedback (no schema changes)
  - Shows: Leaflet map of feedback points + basic charts (trend, rating mix, source mix)
  - Surgical UI only. No backend touches.
  - If fetch fails, falls back to sample data (so the page still renders for demo)
  ──────────────────────────────────────────────────────────────────────────────
*/

type FeedbackItem = {
  id: string;
  comment?: string;
  rating?: number; // 1..5 or -1/0/1, we'll normalize
  sentiment?: "positive" | "neutral" | "negative";
  source?: string; // e.g. "web", "sheet", "admin"
  connector?: string; // e.g. "Type2", "CCS", "CHAdeMO"
  createdAt?: string; // ISO
  lat?: number;
  lng?: number;
  stationId?: string | number;
};

function useFeedbackData() {
  const [data, setData] = useState<FeedbackItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/feedback?limit=1000", { cache: "no-store" });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      // Accept either {items:[...]} or array directly
      const items: FeedbackItem[] = Array.isArray(json) ? json : json.items ?? [];
      setData(items);
    } catch (e: any) {
      console.warn("/api/feedback failed, using fallback demo data", e);
      // Fallback demo points (Karachi & London) – does not break real data
      const fallback: FeedbackItem[] = [
        {
          id: "demo-1",
          comment: "Charger working, a bit slow.",
          rating: 4,
          sentiment: "positive",
          source: "web",
          connector: "Type2",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
          lat: 24.8607,
          lng: 67.0011,
          stationId: "PK-001",
        },
        {
          id: "demo-2",
          comment: "Out of service.",
          rating: 1,
          sentiment: "negative",
          source: "sheet",
          connector: "CCS",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
          lat: 51.5072,
          lng: -0.1276,
          stationId: "UK-LDN-002",
        },
        {
          id: "demo-3",
          comment: "New connector added.",
          rating: 5,
          sentiment: "positive",
          source: "admin",
          connector: "CHAdeMO",
          createdAt: new Date().toISOString(),
          lat: 51.509,
          lng: -0.08,
          stationId: "UK-LDN-003",
        },
      ];
      setData(fallback);
      setError(e?.message || "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return { data: data ?? [], loading, error, reload: load } as const;
}

function formatDay(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AdminFeedbackPage() {
  const { data, loading, error, reload } = useFeedbackData();

  // Derived datasets for charts
  const trend = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of data) {
      const key = formatDay(f.createdAt);
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, count]) => ({ date, count }));
  }, [data]);

  const ratingMix = useMemo(() => {
    const buckets = new Map<number, number>();
    for (const f of data) {
      const r = typeof f.rating === "number" ? Math.max(1, Math.min(5, Math.round(f.rating))) : 0;
      if (!r) continue;
      buckets.set(r, (buckets.get(r) ?? 0) + 1);
    }
    return Array.from({ length: 5 }, (_, i) => {
      const r = i + 1;
      return { rating: `${r}★`, count: buckets.get(r) ?? 0 };
    });
  }, [data]);

  const sourceMix = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const f of data) {
      const s = f.source || "unknown";
      buckets.set(s, (buckets.get(s) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([name, value]) => ({ name, value }));
  }, [data]);

  // Center map either on first point or a sensible default (London)
  const mapCenter: [number, number] = useMemo(() => {
    const p = data.find((d) => typeof d.lat === "number" && typeof d.lng === "number");
    return p ? [p.lat as number, p.lng as number] : [51.5072, -0.1276];
  }, [data]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Feedback — Map & Charts</h1>
        <div className="flex items-center gap-2">
          {loading ? (
            <span className="inline-flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading
            </span>
          ) : null}
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 px-3 py-2 rounded-lg">
          Using demo data because API failed: <span className="font-medium">{error}</span>
        </div>
      ) : null}

      {/* Map */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="h-[420px] w-full rounded-xl overflow-hidden">
            <div className="h-full w-full">
              <MapContainer
                center={mapCenter}
                zoom={5}
                scrollWheelZoom
                className="h-full w-full"
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {data
                  .filter((d) => typeof d.lat === "number" && typeof d.lng === "number")
                  .map((d) => (
                    <Marker key={d.id} position={[d.lat as number, d.lng as number] as [number, number]}>
                      <Popup>
                        <div className="text-sm space-y-1">
                          <div className="font-medium inline-flex items-center">
                            <MapPin className="h-4 w-4 mr-1" /> Station {String(d.stationId ?? "?")}
                          </div>
                          {d.comment ? <div>“{d.comment}”</div> : null}
                          <div>Rating: <span className="font-medium">{d.rating ?? "n/a"}</span></div>
                          {d.connector ? <div>Connector: {d.connector}</div> : null}
                          {d.source ? <div>Source: {d.source}</div> : null}
                          {d.createdAt ? <div>Date: {new Date(d.createdAt).toLocaleString()}</div> : null}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
              </MapContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="shadow-sm col-span-1 lg:col-span-2">
          <CardContent className="p-4">
            <h2 className="text-lg font-medium mb-2">Daily feedback trend</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4">
            <h2 className="text-lg font-medium mb-2">Rating mix</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ratingMix} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="rating" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pie chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <h2 className="text-lg font-medium mb-2">Source mix</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sourceMix} dataKey="value" nameKey="name" outerRadius={90}>
                    {sourceMix.map((_, idx) => (
                      <Cell key={idx} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={24} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4">
            <h2 className="text-lg font-medium mb-2">At‑a‑glance</h2>
            <ul className="text-sm space-y-1">
              <li>Total feedback: <span className="font-medium">{data.length}</span></li>
              <li>
                With coordinates: <span className="font-medium">{data.filter(d => typeof d.lat === "number" && typeof d.lng === "number").length}</span>
              </li>
              <li>Unique stations: <span className="font-medium">{new Set(data.map(d => d.stationId).filter(Boolean)).size}</span></li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Installation notes (once per repo):
// 1) npm i recharts
// 2) npm i react-leaflet leaflet   (already present in Autodun; keep for safety)
// 3) Ensure Tailwind & shadcn/ui are configured (already in project)
// 4) This file lives at app/admin/feedback/page.tsx (App Router). If using pages/,
//    move into pages/admin/feedback.tsx and adjust default export accordingly.
// 5) No API changes required. Uses GET /api/feedback?limit=1000, falls back to demo.
// ─────────────────────────────────────────────────────────────────────────────
