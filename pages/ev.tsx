import React from "react";
import dynamic from "next/dynamic";
const HeatmapWithScaling = dynamic(() => import("../components/HeatmapWithScaling"), { ssr: false });
import type { Point } from "../components/HeatmapWithScaling";

// zoom → radius (km)
function kmForZoom(z: number) {
  const base = 420; // km at z≈7
  return Math.max(80, Math.round(base / Math.pow(2, (z - 7) / 2)));
}
const SUPPORTED_CC = new Set(["GB","IE","DE","FR","ES"]);

// quick deg-distance
function degDist(a:[number,number], b:[number,number]) {
  const dLat = Math.abs(a[0]-b[0]);
  const dLon = Math.abs(a[1]-b[1]);
  return Math.max(dLat, dLon);
}

export default function EVPage() {
  // country + data
  const [cc, setCC] = React.useState<"GB"|"IE"|"DE"|"FR"|"ES">("GB");
  const [points, setPoints] = React.useState<Point[]>([]);
  const [filteredCount, setFilteredCount] = React.useState(0);

  // filters
  const [dcOnly, setDcOnly] = React.useState(false);
  const [minKW, setMinKW] = React.useState(0);
  const [minConn, setMinConn] = React.useState(0);
  const ALL_TYPES = ["CCS","CHAdeMO","Type 2","Tesla"];
  const [typesSel, setTypesSel] = React.useState<string[]>(ALL_TYPES);
  const [operator, setOperator] = React.useState<string>("any");

  // viewport
  const [center, setCenter] = React.useState<[number, number]>([51.5074, -0.1278]);
  const [zoom, setZoom] = React.useState<number>(7);
  const [externalCenter, setExternalCenter] = React.useState<{lat:number;lng:number;z?:number}|null>(null);

  // search
  const [search, setSearch] = React.useState("");

  // ui
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // header height for map offset
  const barRef = React.useRef<HTMLDivElement>(null);
  const headerOffset = (barRef.current?.getBoundingClientRect().height ?? 0) + 12;

  // operators list
  const operatorOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of points) set.add((p.op || "Unknown").trim());
    return ["any", ...Array.from(set).sort((a,b)=>a.localeCompare(b))];
  }, [points]);

  // ---------- fetch via API ----------
  const lastFetchRef = React.useRef<{c:[number,number]; z:number} | null>(null);

  const fetchData = React.useCallback(async (opts?: {
    silent?: boolean; lat?: number; lon?: number; radius?: number; ccOverride?: string;
  }) => {
    try {
      setError(null);
      if (!opts?.silent) setLoading(true);

      const lat = opts?.lat ?? center[0];
      const lon = opts?.lon ?? center[1];
      const radius = opts?.radius ?? kmForZoom(zoom);
      const useCC = (opts?.ccOverride ?? cc);

      const r = await fetch(`/api/ev-points?cc=${encodeURIComponent(useCC)}&lat=${lat}&lon=${lon}&distKm=${radius}`);
      if (!r.ok) throw new Error(`API ${r.status}`);
      const data: Point[] = await r.json();
      setPoints(Array.isArray(data) ? data : []);
      lastFetchRef.current = { c:[lat,lon], z: zoom };
    } catch (e:any) {
      setError(e?.message ?? "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [cc, center, zoom]);

  // initial fetch + one-time retry if empty
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchData({ silent:false });
      if (!cancelled) {
        setTimeout(async () => {
          if (points.length === 0) {
            await fetchData({ silent:true });
          }
        }, 2500);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-fetch when country changes
  React.useEffect(() => { fetchData({ silent:false }); }, [cc, fetchData]);

  // auto-refetch when viewport changes enough (debounced)
  React.useEffect(() => {
    const t = setTimeout(() => {
      const last = lastFetchRef.current;
      const now: [number,number] = center;
      const need = !last || degDist(last.c, now) > 0.4 || Math.abs((last.z||0) - zoom) >= 1;
      if (need) fetchData({ silent:true });
    }, 700);
    return () => clearTimeout(t);
  }, [center[0], center[1], zoom, fetchData]);

  // viewport callback from map
  const handleViewport = React.useCallback((c:[number,number], z:number) => { setCenter(c); setZoom(z); }, []);

  // ---------- search & geolocate ----------
  async function handleGo() {
    const q = search.trim();
    if (!q) return;
    try {
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
        await fetchData({ silent:true, lat, lon, radius: kmForZoom(12), ccOverride: newCC ?? cc });
      }
    } catch {
      // ignore
    }
  }
  function handleGeolocate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setExternalCenter({ lat, lng: lon, z: 12 });
        await fetchData({ silent:true, lat, lon, radius: kmForZoom(12) });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // type toggles
  const allChecked = typesSel.length === ALL_TYPES.length;
  const toggleType = (t:string) => setTypesSel(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  return (
    <div style={{ padding: 0 }}>
      {/* HEADER */}
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
            <button onClick={() => fetchData({ silent:false })} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
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
        offsetTopPx={headerOffset}
      />

      {/* Optional empty-state hint */}
      {(!loading && points.length === 0) ? (
        <div style={{ position: "absolute", top: 72, left: 16, background: "#fff7d6", border: "1px solid #efd48a", padding: "8px 12px", borderRadius: 8, zIndex: 1002 }}>
          No points yet for this view. Try ⟶ Refresh, zoom out, or search another place.
        </div>
      ) : null}
    </div>
  );
}
