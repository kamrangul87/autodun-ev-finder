// pages/ev.tsx
import React from "react";
import dynamic from "next/dynamic";
const HeatmapWithScaling = dynamic(() => import("../components/HeatmapWithScaling"), { ssr: false });
import type { Point } from "../components/HeatmapWithScaling";

function kmForZoom(z: number) {
  const base = 420;
  return Math.max(80, Math.round(base / Math.pow(2, (z - 7) / 2)));
}

export default function EVPage() {
  // GB only
  const [points, setPoints] = React.useState<Point[]>([]);
  const [filteredCount, setFilteredCount] = React.useState(0);

  const [dcOnly, setDcOnly] = React.useState(false);
  const [minKW, setMinKW] = React.useState(0);
  const [minConn, setMinConn] = React.useState(0);
  const ALL_TYPES = ["CCS", "CHAdeMO", "Type 2", "Tesla"];
  const [typesSel, setTypesSel] = React.useState<string[]>(ALL_TYPES);
  const [operator, setOperator] = React.useState<string>("any");

  const [center, setCenter] = React.useState<[number, number]>([51.5074, -0.1278]);
  const [zoom, setZoom] = React.useState<number>(7);
  const [externalCenter, setExternalCenter] = React.useState<{lat:number;lng:number;z?:number}|null>(null);

  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<"live"|"stale"|"fallback"| "">("");
  const [upstream, setUpstream] = React.useState<string>("");

  const barRef = React.useRef<HTMLDivElement>(null);
  const headerOffset = (barRef.current?.getBoundingClientRect().height ?? 0) + 12;

  const inFlight = React.useRef<AbortController | null>(null);
  const retryTimer = React.useRef<number | null>(null);

  const operatorOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of points) set.add((p.op || "Unknown").trim());
    return ["any", ...Array.from(set).sort((a,b)=>a.localeCompare(b))];
  }, [points]);

  const doFetch = React.useCallback(async (args?: { lat?:number; lon?:number; radius?:number; showLoader?: boolean; allowRetry?: boolean }) => {
    try {
      if (args?.showLoader !== false) setLoading(true);
      setError(null);
      if (inFlight.current) inFlight.current.abort();
      const ctrl = new AbortController();
      inFlight.current = ctrl;

      const lat = args?.lat ?? center[0];
      const lon = args?.lon ?? center[1];
      const radius = args?.radius ?? kmForZoom(zoom);

      const res = await fetch(`/api/ev-points?lat=${lat}&lon=${lon}&distKm=${radius}`, {
        cache: "no-store",
        signal: ctrl.signal,
      });
      const evSource = (res.headers.get("x-ev-source") as any) || "";
      const up = res.headers.get("x-ev-upstream-status") || "";
      setSource(evSource as any);
      setUpstream(up);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setPoints(Array.isArray(data) ? data : []);

      // If fallback, auto-retry once or twice to escape sample
      if (evSource === "fallback" && (args?.allowRetry ?? true)) {
        if (retryTimer.current) window.clearTimeout(retryTimer.current);
        retryTimer.current = window.setTimeout(() => {
          doFetch({ lat, lon, radius, showLoader: false, allowRetry: false });
        }, 1500);
      }
    } catch (e:any) {
      if (e?.name !== "AbortError") {
        setError(e?.message ?? "Failed to load data");
        setPoints([]);
      }
    } finally {
      setLoading(false);
    }
  }, [center, zoom]);

  React.useEffect(() => { doFetch({ showLoader: true }); }, []); // initial load

  async function handleGo() {
    const q = search.trim();
    if (!q) return;
    try {
      setLoading(true); setError(null);
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=gb&addressdetails=1`
      );
      const js = await r.json();
      if (Array.isArray(js) && js.length > 0) {
        const lat = parseFloat(js[0].lat);
        const lon = parseFloat(js[0].lon);
        setExternalCenter({ lat, lng: lon, z: 13 });
await doFetch({ lat, lon, radius: kmForZoom(13), showLoader: false });
      }
    } catch (e:any) {
      setError(e?.message ?? "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function handleGeolocate() {
    if (!navigator.geolocation) return;
    setLoading(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setExternalCenter({ lat, lng: lon, z: 12 });
        await doFetch({ lat, lon, radius: kmForZoom(12), showLoader: false });
        setLoading(false);
      },
      (err) => { setLoading(false); setError(err?.message ?? "Geolocation failed"); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  const toggleType = (t: string) =>
    setTypesSel(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  return (
    <div style={{ padding: 0 }}>
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
            Live OCM data • {points.length.toLocaleString()} points
            {source && (
              <span style={{ marginLeft: 8, fontWeight: 500, fontSize: 12, opacity: 0.8 }}>
                ({source === "live" ? "live"
                  : source === "stale" ? "stale cache"
                  : "fallback sample"}
                {upstream ? `, upstream ${upstream}` : ""})
              </span>
            )}
          </div>

          <div style={{ marginLeft: 12 }}>Country <b>GB</b></div>

          <div style={{ marginLeft: 12 }}>
            <label><input type="checkbox" checked={dcOnly} onChange={e => setDcOnly(e.target.checked)} /> DC only</label>
          </div>

          <div>Min kW <input type="number" min={0} step={5} value={minKW} onChange={e => setMinKW(+e.target.value || 0)} style={{ width: 70 }}/></div>
          <div>Min connectors <input type="number" min={0} step={1} value={minConn} onChange={e => setMinConn(+e.target.value || 0)} style={{ width: 70 }}/></div>

          <div>Network{" "}
            <select value={operator} onChange={e => setOperator(e.target.value)}>
              {["any", ...new Set(points.map(p => (p.op || "Unknown").trim()))].map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
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
            <button onClick={() => doFetch({ showLoader: true })}>{loading ? "Loading..." : "Refresh"}</button>
          </div>
        </div>

        {error ? <div style={{ marginTop: 6, color: "#b00020" }}>Error: {error}</div> : null}
      </div>

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
