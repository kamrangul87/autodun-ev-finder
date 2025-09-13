// pages/ev.tsx
import React from "react";
import dynamic from "next/dynamic";
const HeatmapWithScaling = dynamic(() => import("../components/HeatmapWithScaling"), { ssr: false });
import type { Point } from "../components/HeatmapWithScaling";

function kmForZoom(z: number) {
  const base = 420;
  return Math.max(80, Math.round(base / Math.pow(2, (z - 7) / 2)));
}
const SUPPORTED_CC = new Set(["GB","IE","DE","FR","ES"]);

export default function EVPage() {
  // Core state
  const [cc, setCC] = React.useState<"GB"|"IE"|"DE"|"FR"|"ES">("GB");
  const [points, setPoints] = React.useState<Point[]>([]);
  const [filteredCount, setFilteredCount] = React.useState(0);

  // Filters
  const [dcOnly, setDcOnly] = React.useState(false);
  const [minKW, setMinKW] = React.useState(0);
  const [minConn, setMinConn] = React.useState(0);
  const ALL_TYPES = ["CCS","CHAdeMO","Type 2","Tesla"];
  const [typesSel, setTypesSel] = React.useState<string[]>(ALL_TYPES);
  const [operator, setOperator] = React.useState<string>("any");

  // View
  const [center, setCenter] = React.useState<[number, number]>([51.5074, -0.1278]);
  const [zoom, setZoom] = React.useState<number>(7);
  const [externalCenter, setExternalCenter] = React.useState<{lat:number;lng:number;z?:number}|null>(null);

  // UI
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const barRef = React.useRef<HTMLDivElement>(null);
  const headerOffset = (barRef.current?.getBoundingClientRect().height ?? 0) + 12;

  const operatorOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of points) set.add((p.op || "Unknown").trim());
    return ["any", ...Array.from(set).sort((a,b)=>a.localeCompare(b))];
  }, [points]);

  // --- Fetch wrapper (deterministic; always clears loading) ---
  const fetchData = React.useCallback(async (p?: { lat?:number; lon?:number; ccOverride?: string; radius?:number; showLoader?: boolean }) => {
    try {
      if (p?.showLoader !== false) setLoading(true);
      setError(null);
      const lat = p?.lat ?? center[0];
      const lon = p?.lon ?? center[1];
      const radius = p?.radius ?? kmForZoom(zoom);
      const useCC = p?.ccOverride ?? cc;

      const url = `/api/ev-points?cc=${encodeURIComponent(useCC)}&lat=${lat}&lon=${lon}&distKm=${radius}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`API ${r.status}`);
      const data: unknown = await r.json();
      setPoints(Array.isArray(data) ? (data as Point[]) : []);
    } catch (e:any) {
      setPoints([]);
      setError(e?.message ?? "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [cc, center, zoom]);

  // Initial load
  React.useEffect(() => { fetchData({ showLoader: true }); }, []); // eslint-disable-line

  // Reload when country changes (user action)
  React.useEffect(() => { fetchData({ showLoader: true }); }, [cc]); // eslint-disable-line

  // Search
  async function handleGo() {
    const q = search.trim();
    if (!q) return;
    try {
      setLoading(true); setError(null);
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=${cc.toLowerCase()}&addressdetails=1`
      );
      const js = await resp.json();
      if (Array.isArray(js) && js.length > 0) {
        const lat = parseFloat(js[0].lat);
        const lon = parseFloat(js[0].lon);
        const newCCRaw = js[0]?.address?.country_code ? String(js[0].address.country_code).toUpperCase() : null;
        const newCC = (newCCRaw && SUPPORTED_CC.has(newCCRaw)) ? newCCRaw : null;
        if (newCC && newCC !== cc) setCC(newCC as any);
        setExternalCenter({ lat, lng: lon, z: 12 });
        await fetchData({ lat, lon, radius: kmForZoom(12), ccOverride: newCC ?? cc, showLoader: false });
      }
    } catch (e:any) {
      setError(e?.message ?? "Search failed");
    } finally {
      setLoading(false);
    }
  }

  // Geolocate
  function handleGeolocate() {
    if (!navigator.geolocation) return;
    setLoading(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setExternalCenter({ lat, lng: lon, z: 12 });
        await fetchData({ lat, lon, radius: kmForZoom(12), showLoader: false });
        setLoading(false);
      },
      (err) => { setLoading(false); setError(err?.message ?? "Geolocation failed"); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  const toggleType = (t:string) =>
    setTypesSel(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  return (
    <div style={{ padding: 0 }}>
      {/* Sticky header */}
      <div
        ref={barRef}
        style={{
          position: "sticky", top: 8, zIndex: 1001,
          background: "rgba(255,255,255,0.95)", boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          borderRadius: 12, margin: 12, padding: 12
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 600 }}>
            Live OCM data <span style={{ opacity: 0.7 }}>• {points.length.toLocaleString()} points</span>
          </div>

          <div style={{ marginLeft: 12 }}>
            Country{" "}
            <select value={cc} onChange={e => setCC(e.target.value as any)}>
              <option value="GB">GB</option><option value="IE">IE</option>
              <option value="DE">DE</option><option value="FR">FR</option><option value="ES">ES</option>
            </select>
          </div>

          <div style={{ marginLeft: 12 }}>
            <label><input type="checkbox" checked={dcOnly} onChange={e => setDcOnly(e.target.checked)} /> DC only</label>
          </div>

          <div>Min kW <input type="number" min={0} step={5} value={minKW} onChange={e => setMinKW(+e.target.value || 0)} style={{ width: 70 }}/></div>
          <div>Min connectors <input type="number" min={0} step={1} value={minConn} onChange={e => setMinConn(+e.target.value || 0)} style={{ width: 70 }}/></div>

          <div>Network{" "}
            <select value={operator} onChange={e => setOperator(e.target.value)}>
              {operatorOptions.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Types:
            {ALL_TYPES.map(t => (
              <label key={t} style={{ marginRight: 6 }}>
                <input type="checkbox" checked={typesSel.includes(t)} onChange={() => toggleType(t)} /> {t}
              </label>
            ))}
            <button onClick={() => setTypesSel(ALL_TYPES.slice())} style={{ marginLeft: 4 }}>All</button>
            <button onClick={() => setTypesSel([])} style={{ marginLeft: 4 }}>None</button>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <input
              placeholder="Search place or postcode..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleGo(); }}
              style={{ width: 260, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8 }}
            />
            <button onClick={handleGo}>Go</button>
            <button onClick={handleGeolocate}>Geolocate</button>
            <button onClick={() => fetchData({ showLoader: true })}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {error ? <div style={{ marginTop: 6, color: "#b00020" }}>Error: {error}</div> : null}
      </div>

      {/* Map */}
      <HeatmapWithScaling
        points={points}
        filters={{ operator, dcOnly, minKW, minConn, types: typesSel }}
        onViewportChange={(c, z) => { setCenter(c); setZoom(z); }}
        onFilteredCountChange={setFilteredCount}
        externalCenter={externalCenter}
        offsetTopPx={headerOffset}
      />
    </div>
  );
}
