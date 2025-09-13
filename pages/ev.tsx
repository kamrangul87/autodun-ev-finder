// pages/ev.tsx
import React from "react";
import Head from "next/head";
import dynamic from "next/dynamic";

// NOTE: we import the map component dynamically because Leaflet needs the browser.
const HeatmapWithScaling = dynamic(() => import("../components/HeatmapWithScaling"), { ssr: false });

// ---------- Types (kept in sync with the component) ----------
type Breakdown = { reports: number; downtime: number; connectors: number };
type Point = {
  id?: number | null;
  name?: string | null;
  lat: number; lng: number; value: number;
  breakdown?: Breakdown; op?: string; dc?: boolean; kw?: number;
  conn?: number; types?: string[];
};
type Filters = {
  operator?: string;
  dcOnly?: boolean;
  minKW?: number;
  minConn?: number;
  types?: string[];
};
type UI = { scale: "linear" | "log" | "robust"; radius: number; blur: number };
type View = { lat: number; lng: number; z: number };

const DEFAULT_VIEW: View = { lat: 52.5, lng: -1.5, z: 6 };
const DEFAULT_UI: UI = { scale: "robust", radius: 60, blur: 35 };
const DEFAULT_FILTERS: Filters = {
  operator: "any",
  dcOnly: false,
  minKW: 0,
  minConn: 0,
  types: ["CCS", "CHAdeMO", "Type 2", "Tesla"], // all on by default
};

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function radiusKmFromZoom(z: number) {
  // crude: wide radius for low zoom, tighter for close zoom
  if (z <= 6) return 500;
  if (z <= 8) return 300;
  if (z <= 10) return 120;
  if (z <= 12) return 60;
  return 30;
}

export default function EVPage() {
  // ---------- state ----------
  const [country, setCountry] = React.useState<string>("GB");
  const [points, setPoints] = React.useState<Point[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);

  // These are visible in the header – just descriptive labels; tune as you like.
  const [reportsHalflife, setReportsHalflife] = React.useState<number>(96);
  const [downHalflife, setDownHalflife] = React.useState<number>(66);

  const [ui, setUI] = React.useState<UI>(DEFAULT_UI);
  const [view, setView] = React.useState<View>(DEFAULT_VIEW);
  const [filters, setFilters] = React.useState<Filters>(DEFAULT_FILTERS);

  // NEW: this is what we show as "(filtered N)" in the header.
  const [filteredCount, setFilteredCount] = React.useState<number>(0);

  // search box
  const [place, setPlace] = React.useState<string>("");

  // ---------- derived ----------
  const operatorOptions = React.useMemo(() => {
    const list = uniq(
      points
        .map((p) => (p.op || "").trim())
        .filter(Boolean)
        .map((s) => s.replace(/\s+/g, " "))
    ).sort((a, b) => a.localeCompare(b));
    return ["any", ...list];
  }, [points]);

  // ---------- data fetch ----------
  async function fetchData(opts?: { silent?: boolean; lat?: number; lon?: number; radius?: number }) {
    const { silent = false } = opts || {};
    const lat = opts?.lat ?? view.lat;
    const lon = opts?.lon ?? view.lng;
    const radius = opts?.radius ?? radiusKmFromZoom(view.z);

    if (!silent) setLoading(true);
    try {
      const qs = new URLSearchParams({
        cc: country, // server-side uses cc to scope to country
        lat: String(lat),
        lon: String(lon),
        distKm: String(radius),
      });
      const r = await fetch(`/api/ev-points?${qs.toString()}`);
      if (!r.ok) throw new Error(`API ${r.status}`);
      const data: Point[] = await r.json();
      setPoints(data);
    } catch (e) {
      console.error(e);
      alert("Failed to fetch EV data.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // first load
  React.useEffect(() => {
    fetchData({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- geocode helpers ----------
  async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
    try {
      const u = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
      const r = await fetch(u);
      if (!r.ok) return null;
      const j = (await r.json()) as Array<{ lat: string; lon: string }>;
      if (!j || j.length === 0) return null;
      return { lat: Number(j[0].lat), lon: Number(j[0].lon) };
    } catch {
      return null;
    }
  }

  // ---------- share link ----------
  function buildShareUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set("cc", country);
    url.searchParams.set("lat", String(view.lat));
    url.searchParams.set("lng", String(view.lng));
    url.searchParams.set("z", String(view.z));
    url.searchParams.set("s", ui.scale);
    url.searchParams.set("r", String(ui.radius));
    url.searchParams.set("b", String(ui.blur));
    url.searchParams.set("op", String(filters.operator || "any"));
    url.searchParams.set("dc", String(filters.dcOnly ? 1 : 0));
    url.searchParams.set("kw", String(filters.minKW ?? 0));
    url.searchParams.set("c", String(filters.minConn ?? 0));
    url.searchParams.set("types", (filters.types ?? []).join(","));
    return url.toString();
  }
  function copyShare() {
    const u = buildShareUrl();
    navigator.clipboard?.writeText(u);
    alert("Sharable link copied to clipboard.");
