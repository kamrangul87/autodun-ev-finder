// pages/admin/feedback.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type React from "react";
import type { Map as LeafletMap } from "leaflet";
import L from "leaflet";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/router";

// ────────────────────── Map dynamic imports (avoid SSR issues) ──────────────────────
const MapContainer = dynamic(
  async () => (await import("react-leaflet")).MapContainer,
  { ssr: false }
);
const TileLayer = dynamic(async () => (await import("react-leaflet")).TileLayer, { ssr: false });
const Marker = dynamic(async () => (await import("react-leaflet")).Marker, { ssr: false });
const Popup = dynamic(async () => (await import("react-leaflet")).Popup, { ssr: false });

// Fix default marker icons
if (typeof window !== "undefined") {
  // @ts-ignore
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

// ────────────────────── Types ──────────────────────
type FeedbackRow = {
  id: string;
  created_at: string;
  label: "good" | "bad" | null;
  ml_score: number | null;
  model?: string | null;
  source?: string | null;
  station_name?: string | null;
  comment?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type Filters = {
  sentiment: "All" | "Good" | "Bad";
  minScore: number;
  maxScore: number;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  q: string;
  model: "All" | string;
  source: "All" | string;
  sort: "Recent" | "Oldest" | "Score↑" | "Score↓";
};

// ────────────────────── Supabase client ──────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// ────────────────────── Page ──────────────────────
export default function AdminFeedbackPage() {
  const router = useRouter();

  // Filter state
  const [filters, setFilters] = useState<Filters>(() => {
    // Hydrate from URL (optional)
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : undefined;
    return {
      sentiment: (q?.get("sent") as any) || "All",
      minScore: Number(q?.get("min") ?? 0),
      maxScore: Number(q?.get("max") ?? 100),
      from: q?.get("from") || undefined,
      to: q?.get("to") || undefined,
      q: q?.get("q") || "",
      model: (q?.get("model") as any) || "All",
      source: (q?.get("source") as any) || "All",
      sort: (q?.get("sort") as any) || "Recent",
    };
  });

  // Data
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Map
  const mapRef = useRef<LeafletMap | null>(null);
  const onMapReady = (e: L.LeafletEvent) => {
    mapRef.current = e.target as LeafletMap;
  };
  const fitToResults = () => {
    const pts = rows.filter(r => r.lat && r.lng).map(r => [r.lat!, r.lng!] as [number, number]);
    if (!pts.length || !mapRef.current) return;
    const b = L.latLngBounds(pts);
    mapRef.current.fitBounds(b.pad(0.2));
  };

  // URL sync (optional + shallow)
  useEffect(() => {
    const q = new URLSearchParams();
    if (filters.sentiment !== "All") q.set("sent", filters.sentiment);
    if (filters.minScore !== 0) q.set("min", String(filters.minScore));
    if (filters.maxScore !== 100) q.set("max", String(filters.maxScore));
    if (filters.from) q.set("from", filters.from);
    if (filters.to) q.set("to", filters.to);
    if (filters.q) q.set("q", filters.q);
    if (filters.model !== "All") q.set("model", filters.model);
    if (filters.source !== "All") q.set("source", filters.source);
    if (filters.sort !== "Recent") q.set("sort", filters.sort);

    router.replace(
      { pathname: router.pathname, query: Object.fromEntries(q.entries()) },
      undefined,
      { shallow: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  // Build query from filters
  function applyFilters(q: any, f: Filters) {
    if (f.sentiment !== "All") q = q.eq("label", f.sentiment.toLowerCase());
    if (Number.isFinite(f.minScore)) q = q.gte("ml_score", f.minScore);
    if (Number.isFinite(f.maxScore)) q = q.lte("ml_score", f.maxScore);
    if (f.from) q = q.gte("created_at", `${f.from}T00:00:00Z`);
    if (f.to) q = q.lte("created_at", `${f.to}T23:59:59Z`);
    if (f.model !== "All") q = q.eq("model", f.model);
    if (f.source !== "All") q = q.eq("source", f.source);
    if (f.q && f.q.trim()) {
      const s = `%${f.q.trim()}%`;
      q = q.or(`comment.ilike.${s},station_name.ilike.${s}`);
    }
    switch (f.sort) {
      case "Oldest": q = q.order("created_at", { ascending: true }); break;
      case "Score↑": q = q.order("ml_score", { ascending: true }); break;
      case "Score↓": q = q.order("ml_score", { ascending: false }); break;
      default: q = q.order("created_at", { ascending: false });
    }
    return q;
  }

  // Fetch rows on filters change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let q = supabase.from("feedback").select("*");
        q = applyFilters(q, filters);
        const { data, error } = await q.limit(2000);
        if (!cancelled) {
          if (error) console.error(error);
          setRows((data as FeedbackRow[]) || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [JSON.stringify(filters)]);

  // Realtime refresh
  useEffect(() => {
    const ch = supabase
      .channel("feedback-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback" }, () => {
        // trigger re-fetch via a no-op state update
        setFilters((f) => ({ ...f }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // KPIs
  const kpi = useMemo(() => {
    const total = rows.length;
    const good = rows.filter(r => r.label === "good").length;
    const bad = rows.filter(r => r.label === "bad").length;
    const avg = total ? rows.reduce((a, r) => a + (r.ml_score || 0), 0) / total : 0;
    const todayStr = new Date().toDateString();
    const today = rows.filter(r => new Date(r.created_at).toDateString() === todayStr);
    const todayGood = today.filter(r => r.label === "good").length;
    const todayBad = today.filter(r => r.label === "bad").length;
    return { total, good, bad, pctGood: total ? (good / total) * 100 : 0, avg, todayGood, todayBad };
  }, [rows]);

  // 3-day timeline
  const timeline3d = useMemo(() => {
    const byDay = new Map<string, { count: number; sum: number }>();
    for (const r of rows) {
      const d = new Date(r.created_at).toISOString().slice(0, 10);
      const v = byDay.get(d) || { count: 0, sum: 0 };
      v.count++; v.sum += r.ml_score || 0;
      byDay.set(d, v);
    }
    const keys = Array.from(byDay.keys()).sort().slice(-3).reverse();
    return keys.map(k => {
      const v = byDay.get(k)!;
      return { date: k, count: v.count, avg: v.count ? v.sum / v.count : 0 };
    });
  }, [rows]);

  // CSV export
  const exportCSV = () => {
    const cols: (keyof FeedbackRow)[] = [
      "created_at", "label", "ml_score", "model", "source", "station_name", "comment", "lat", "lng",
    ];
    const header = cols.join(",");
    const lines = rows.map(r =>
      cols.map(c => {
        const raw = (r[c] ?? "") as any;
        const safe = String(raw).replaceAll('"', '""').replaceAll("\n", " ");
        return `"${safe}"`;
      }).join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `feedback_export_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () =>
    setFilters({
      sentiment: "All",
      minScore: 0,
      maxScore: 100,
      from: undefined,
      to: undefined,
      q: "",
      model: "All",
      source: "All",
      sort: "Recent",
    });

  // ────────────────────── UI ──────────────────────
  return (
    <div style={{ padding: "24px", maxWidth: 1180, margin: "0 auto" }}>
      <h1 style={{ fontWeight: 700, fontSize: 28, marginBottom: 16 }}>Autodun Admin · Feedback</h1>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 12 }}>
        <KPI title="Total" value={kpi.total} />
        <KPI title="Good" value={kpi.good} />
        <KPI title="Bad" value={kpi.bad} />
        <KPI title="% Good" value={`${kpi.pctGood.toFixed(0)}%`} />
        <KPI title="Avg ML Score" value={kpi.avg.toFixed(3)} />
        <KPI title="Today · Good" value={kpi.todayGood} />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => setFilters(f => ({ ...f }))} style={btn}>Refresh</button>
        <button onClick={resetFilters} style={btnSecondary}>Reset</button>
        <button onClick={exportCSV} style={btnPrimary}>Export CSV</button>
      </div>

      {/* Filters */}
      <section style={card}>
        <h3 style={{ marginBottom: 12 }}>Filters</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 10 }}>
          <Labeled label="Sentiment">
            <select
              value={filters.sentiment}
              onChange={e => setFilters(f => ({ ...f, sentiment: e.target.value as Filters["sentiment"] }))}
            >
              <option>All</option><option>Good</option><option>Bad</option>
            </select>
          </Labeled>

          <Labeled label="Score ≥">
            <input
              type="number" value={filters.minScore}
              onChange={e => setFilters(f => ({ ...f, minScore: Number(e.target.value || 0) }))}
            />
          </Labeled>

          <Labeled label="Score ≤">
            <input
              type="number" value={filters.maxScore}
              onChange={e => setFilters(f => ({ ...f, maxScore: Number(e.target.value || 100) }))}
            />
          </Labeled>

          <Labeled label="From">
            <input
              type="date" value={filters.from || ""} onChange={e => setFilters(f => ({ ...f, from: e.target.value || undefined }))}
            />
          </Labeled>

          <Labeled label="To">
            <input
              type="date" value={filters.to || ""} onChange={e => setFilters(f => ({ ...f, to: e.target.value || undefined }))}
            />
          </Labeled>

          <Labeled label="Search">
            <input
              placeholder="comment / station"
              value={filters.q}
              onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
            />
          </Labeled>

          <Labeled label="Model">
            <select
              value={filters.model}
              onChange={e => setFilters(f => ({ ...f, model: e.target.value as any }))}
            >
              <option>All</option>
              <option value="lgbm-v1">lgbm-v1</option>
              <option value="baseline">baseline</option>
              {/* add your models */}
            </select>
          </Labeled>

          <Labeled label="Source">
            <select
              value={filters.source}
              onChange={e => setFilters(f => ({ ...f, source: e.target.value as any }))}
            >
              <option>All</option>
              <option value="sheet">sheet</option>
              <option value="admin">admin</option>
              {/* add your sources */}
            </select>
          </Labeled>

          <Labeled label="Sort">
            <select
              value={filters.sort}
              onChange={e => setFilters(f => ({ ...f, sort: e.target.value as Filters["sort"] }))}
            >
              <option>Recent</option>
              <option>Oldest</option>
              <option>Score↑</option>
              <option>Score↓</option>
            </select>
          </Labeled>
        </div>
      </section>

      {/* Timeline */}
      <section style={card}>
        <h3 style={{ marginBottom: 12 }}>Timeline (last 3 days)</h3>
        <div>
          {timeline3d.map(row => (
            <div key={row.date} style={{ display: "grid", gridTemplateColumns: "140px 1fr 100px", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <div>{row.date}</div>
              <div style={{ background: "#eee", height: 10, borderRadius: 6 }}>
                <div style={{ width: `${Math.min(100, row.count * 12)}%`, height: "100%", borderRadius: 6, background: "#4285f4" }} />
              </div>
              <div style={{ textAlign: "right" }}>Avg ML: {row.avg.toFixed(3)}</div>
            </div>
          ))}
          {!timeline3d.length && <div style={{ color: "#666" }}>No data in range.</div>}
        </div>
      </section>

      {/* Map */}
      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3>Feedback Map</h3>
          <button onClick={fitToResults} style={btn}>Fit to results</button>
        </div>
        <div style={{ height: 420, borderRadius: 8, overflow: "hidden" }}>
          <MapContainer
            center={[52.8, -1.6]}
            zoom={6}
            style={{ height: "100%", width: "100%" }}
            whenReady={onMapReady}
          >
            <TileLayer url={process.env.NEXT_PUBLIC_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />
            {rows.filter(r => r.lat && r.lng).map(r => (
              <Marker key={r.id} position={[r.lat!, r.lng!]}>
                <Popup>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{r.station_name || "Station"}</div>
                  <div><b>Label:</b> {r.label ?? "-"}</div>
                  <div><b>Score:</b> {r.ml_score ?? "-"}</div>
                  <div><b>Model:</b> {r.model ?? "-"}</div>
                  <div><b>Source:</b> {r.source ?? "-"}</div>
                  <div style={{ marginTop: 6 }}>{r.comment}</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </section>

      {/* Table (simple preview) */}
      <section style={card}>
        <h3 style={{ marginBottom: 12 }}>
          Results {loading ? "· Loading…" : `· ${rows.length}`}
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Date", "Label", "Score", "Model", "Source", "Station", "Comment"].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={td}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={td}>{r.label ?? "-"}</td>
                  <td style={td}>{r.ml_score ?? "-"}</td>
                  <td style={td}>{r.model ?? "-"}</td>
                  <td style={td}>{r.source ?? "-"}</td>
                  <td style={td}>{r.station_name ?? "-"}</td>
                  <td style={td}>{r.comment ?? "-"}</td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr><td style={td} colSpan={7}>No results.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ────────────────────── Small UI helpers ──────────────────────
function KPI({ title, value }: { title: string; value: string | number }) {
  return (
    <div style={kpiCard}>
      <div style={{ color: "#6b7280", fontSize: 12 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
      <span style={{ color: "#374151" }}>{label}</span>
      {children}
    </label>
  );
}

// ────────────────────── Inline styles (kept minimal) ──────────────────────
const card: React.CSSProperties = {
  marginTop: 16,
  padding: 16,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
};

const kpiCard: React.CSSProperties = {
  padding: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  display: "grid",
  gap: 4,
};

const btn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  ...btn,
  background: "#f3f4f6",
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: "#2563eb",
  color: "#fff",
  border: "1px solid #1d4ed8",
};

const th: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #e5e7eb",
  padding: "10px 8px",
  fontWeight: 600,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
  padding: "10px 8px",
  fontSize: 13,
  verticalAlign: "top",
};
