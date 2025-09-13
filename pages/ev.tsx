'use client';

import React from "react";
import dynamic from "next/dynamic";
const HeatmapWithScaling = dynamic(
  () => import("../components/HeatmapWithScaling"),
  { ssr: false }
);

// small helper to compute search distance from zoom (rough)
function kmForZoom(z: number) {
  // very rough heuristic: halve radius each 2 zoom levels
  const base = 400; // km at z ≈ 7
  return Math.max(50, Math.round(base / Math.pow(2, (z - 7) / 2)));
}

export default function EVPage() {
  // ---------- UI state ----------
  const [cc, setCC] = React.useState<"GB" | "IE" | "DE" | "FR" | "ES">("GB");
  const [points, setPoints] = React.useState<Point[]>([]);
  const [filteredCount, setFilteredCount] = React.useState<number>(0);

  const [dcOnly, setDcOnly] = React.useState(false);
  const [minKW, setMinKW] = React.useState(0);
  const [minConn, setMinConn] = React.useState(0);
  const [typesSel, setTypesSel] = React.useState<string[]>(["CCS","CHAdeMO","Type 2","Tesla"]);
  const [operator, setOperator] = React.useState<string>("any");

  const [search, setSearch] = React.useState<string>("");
  const [externalCenter, setExternalCenter] = React.useState<{lat:number;lng:number;z?:number}|null>(null);

  const [center, setCenter] = React.useState<[number, number]>([51.5074, -0.1278]);
  const [zoom, setZoom] = React.useState<number>(7);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // measure header height → offset for flyTo (keeps target under bar)
  const barRef = React.useRef<HTMLDivElement>(null);
  const headerOffset = (barRef.current?.getBoundingClientRect().height ?? 0) + 12;

  // ---------- Fetch OCM data (server-side API proxy) ----------
  const fetchData = React.useCallback(async (opts?: { silent?: boolean; lat?: number; lon?: number; radius?: number }) => {
    try {
      setError(null);
      if (!opts?.silent) setLoading(true);

      const lat = opts?.lat ?? center[0];
      const lon = opts?.lon ?? center[1];
      const radius = opts?.radius ?? kmForZoom(zoom);

      const url = `/api/ev-points?cc=${encodeURIComponent(cc)}&lat=${lat}&lon=${lon}&distKm=${radius}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`API ${r.status}`);
      const data: Point[] = await r.json();
      setPoints(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [cc, center, zoom]);

  // initial fetch
  React.useEffect(() => {
    fetchData({ silent: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-fetch when country changes
  React.useEffect(() => {
    fetchData({ silent: false });
  }, [cc, fetchData]);

  // ---------- Map callbacks ----------
  const handleViewport = React.useCallback((c: [number, number], z: number) => {
    setCenter(c);
    setZoom(z);
  }, []);

  // ---------- Search & Geolocate ----------
  async function handleGo() {
    const q = search.trim();
    if (!q) return;
    try {
      // Nominatim geocode
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=${cc.toLowerCase()}&addressdetails=1`);
      const js = await resp.json();
      if (Array.isArray(js) && js.length > 0) {
        const lat = parseFloat(js[0].lat);
        const lon = parseFloat(js[0].lon);
        // center & zoom in
        setExternalCenter({ lat, lng: lon, z: 12 });
        // also refresh data around that area (silent)
        fetchData({ silent: true, lat, lon, radius: kmForZoom(12) });
      }
    } catch (_) { /* ignore */ }
  }
  function handleGeolocate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setExternalCenter({ lat, lng: lon, z: 12 });
        fetchData({ silent: true, lat, lon, radius: kmForZoom(12) });
      },
      () => { /* ignore */ },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // ---------- Type toggles ----------
  const ALL_TYPES = ["CCS","CHAdeMO","Type 2","Tesla"];
  const allChecked = typesSel.length === ALL_TYPES.length;
  const noneChecked = typesSel.length === 0;
  function toggleType(t: string) {
    setTypesSel(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }
  function setAllTypes(on: boolean) {
    setTypesSel(on ? ALL_TYPES.slice() : []);
  }

  return (
    <div style={{ padding: 0 }}>
      {/* HEADER / FILTER BAR (measured for offset) */}
      <div
        ref={barRef}
        style={{
          position: "relative",
          zIndex: 1001,
          background: "rgba(255,255,255,0.95)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          borderRadius: 12,
          margin: 12,
          padding: 12
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 600 }}>
            Live OCM data
            <span style={{ opacity: 0.7 }}> • {points.length.toLocaleString()} points</span>
            {filteredCount !== points.length ? (
              <span style={{ opacity: 0.7 }}> (filtered {filteredCount.toLocaleString()})</span>
            ) : null}
          </div>

          <div style={{ marginLeft: 12 }}>
            Country{" "}
            <select value={cc} onChange={e => setCC(e.target.value as any)}>
              <option value="GB">GB</option>
              <option value="IE">IE</option>
              <option value="DE">DE</option>
              <option value="FR">FR</option>
              <option value="ES">ES</option>
            </select>
          </div>

          <div style={{ marginLeft: 12 }}>
            <label><input type="checkbox" checked={dcOnly} onChange={e => setDcOnly(e.target.checked)} /> DC only</label>
          </div>

          <div>
            Min kW{" "}
            <input type="number" min={0} step={5} value={minKW} onChange={e => setMinKW(+e.target.value || 0)} style={{ width: 70 }} />
          </div>

          <div>
            Min connectors{" "}
            <input type="number" min={0} step={1} value={minConn} onChange={e => setMinConn(+e.target.value || 0)} style={{ width: 70 }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Types:
            {ALL_TYPES.map(t => (
              <label key={t} style={{ marginRight: 6 }}>
                <input type="checkbox" checked={typesSel.includes(t)} onChange={() => toggleType(t)} /> {t}
              </label>
            ))}
            <button onClick={() => setAllTypes(true)} style={{ marginLeft: 4 }}>All</button>
            <button onClick={() => setAllTypes(false)} style={{ marginLeft: 4 }}>None</button>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <input
              placeholder="Search place or postcode…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleGo(); }}
              style={{ width: 260, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8 }}
            />
            <button onClick={handleGo}>Go</button>
            <button onClick={handleGeolocate}>Geolocate</button>
            <button onClick={() => fetchData({ silent: false })} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
          </div>
        </div>

        {error ? <div style={{ marginTop: 6, color: "#b00020" }}>{error}</div> : null}
      </div>

      {/* MAP */}
      <HeatmapWithScaling
        points={points}
        filters={{ operator, dcOnly, minKW, minConn, types: typesSel }}
        onViewportChange={(c, z) => handleViewport(c, z)}
        onFilteredCountChange={setFilteredCount}
        externalCenter={externalCenter}
        offsetTopPx={headerOffset}               // <<— precise center under the header
      />
    </div>
  );
}
