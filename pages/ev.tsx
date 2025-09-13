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
  }

  // ---------- UI handlers ----------
  function updateFilter<K extends keyof Filters>(k: K, v: Filters[K]) {
    setFilters((f) => ({ ...f, [k]: v }));
  }

  // quick toggle all / none for connector types
  function toggleAllTypes(on: boolean) {
    updateFilter("types", on ? ["CCS", "CHAdeMO", "Type 2", "Tesla"] : []);
  }

  // ---------- render ----------
  return (
    <>
      <Head>
        <title>EV Hotspots</title>
        <meta name="viewport" content="initial-scale=1, width=device-width" />
      </Head>

      <div style={{ position: "relative" }}>
        {/* Top-right control bar */}
        <div
          style={{
            position: "absolute",
            right: 16,
            top: 12,
            zIndex: 1100,
            background: "rgba(255,255,255,0.95)",
            padding: "10px 12px",
            borderRadius: 12,
            boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
            fontSize: 12,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            maxWidth: 980,
          }}
        >
          <div>
            <b>Live OCM data</b> • {points.length.toLocaleString()} points{" "}
            <span style={{ opacity: 0.7 }}>(filtered {filteredCount.toLocaleString()})</span>
          </div>
          <div style={{ opacity: 0.8 }}>
            Country{" "}
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              style={{ font: "inherit" }}
            >
              <option value="GB">GB</option>
              <option value="IE">IE</option>
              <option value="NL">NL</option>
              <option value="DE">DE</option>
              <option value="FR">FR</option>
            </select>
          </div>
          <div style={{ opacity: 0.8 }}>Reports HL {reportsHalflife}</div>
          <div style={{ opacity: 0.8 }}>Downtime HL {downHalflife}</div>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>

          {/* Network/operator filter */}
          <div style={{ paddingLeft: 12, borderLeft: "1px solid #eee", display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ opacity: 0.8 }}>Network</span>
            <select
              value={filters.operator || "any"}
              onChange={(e) => updateFilter("operator", e.target.value)}
              style={{ font: "inherit" }}
            >
              {operatorOptions.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>

            <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={!!filters.dcOnly}
                onChange={(e) => updateFilter("dcOnly", e.target.checked)}
              />
              DC only
            </label>

            <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              Min kW
              <input
                type="number"
                min={0}
                value={filters.minKW ?? 0}
                onChange={(e) => updateFilter("minKW", Math.max(0, Number(e.target.value || 0)))}
                style={{ width: 64 }}
              />
            </label>

            <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              Min connectors
              <input
                type="number"
                min={0}
                value={filters.minConn ?? 0}
                onChange={(e) => updateFilter("minConn", Math.max(0, Number(e.target.value || 0)))}
                style={{ width: 64 }}
              />
            </label>

            {/* Connector type checkboxes */}
            <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <span style={{ opacity: 0.8 }}>Types:</span>
              {["CCS", "CHAdeMO", "Type 2", "Tesla"].map((t) => (
                <label key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={filters.types?.includes(t) ?? false}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setFilters((f) => {
                        const set = new Set(f.types ?? []);
                        if (on) set.add(t);
                        else set.delete(t);
                        return { ...f, types: Array.from(set) };
                      });
                    }}
                  />
                  {t}
                </label>
              ))}
              <button
                title="Enable all connector types"
                onClick={() => toggleAllTypes(true)}
                style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #eee", background: "#fff" }}
              >
                All
              </button>
              <button
                title="Disable all connector types"
                onClick={() => toggleAllTypes(false)}
                style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #eee", background: "#fff" }}
              >
                None
              </button>
            </div>
          </div>

          {/* Search / view actions */}
          <div style={{ paddingLeft: 12, borderLeft: "1px solid #eee", display: "flex", gap: 6, alignItems: "center" }}>
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="Search place…"
              style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #ddd", minWidth: 180 }}
            />
            <button
              onClick={async () => {
                if (!place.trim()) return;
                const g = await geocode(place.trim());
                if (!g) return alert("Place not found.");
                setView((v) => ({ ...v, lat: g.lat, lng: g.lon }));
                await fetchData({ lat: g.lat, lon: g.lon, radius: radiusKmFromZoom(view.z) });
              }}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
            >
              Go
            </button>
            <button
              onClick={() => {
                if (!navigator.geolocation) return alert("Geolocation not available.");
                navigator.geolocation.getCurrentPosition(async (p) => {
                  const lat = p.coords.latitude, lon = p.coords.longitude;
                  setView((v) => ({ ...v, lat, lng: lon }));
                  await fetchData({ lat, lon, radius: radiusKmFromZoom(view.z) });
                });
              }}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
            >
              Geolocate
            </button>
            <button
              title="Refetch based on current map view"
              onClick={() => fetchData({ radius: radiusKmFromZoom(view.z) })}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
            >
              Refetch (view)
            </button>
          </div>

          <button
            onClick={copyShare}
            style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
            title="Copy a sharable link that restores the current view & filters"
          >
            Share link
          </button>
        </div>

        {/* The map itself */}
        <HeatmapWithScaling
          points={points}
          initialUI={ui}
          filters={filters}
          onUIChange={(u) => setUI(u)}
          onViewportChange={(c, z) => setView({ lat: c[0], lng: c[1], z })}
          onFilteredCountChange={setFilteredCount}   // <-- NEW: drives “(filtered N)” in header
        />
      </div>
    </>
  );
}
