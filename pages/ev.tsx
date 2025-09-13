// pages/ev.tsx
import React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import type { Point } from "../components/HeatmapWithScaling";

const HeatmapWithScaling = dynamic(() => import("../components/HeatmapWithScaling"), { ssr: false });

// helpers to read/write query
const parseBool = (v: any, def=false)=> v===undefined?def:(v==='1'||v===1||v==='true');
const num = (v:any, d:number)=> { const n=Number(v); return Number.isFinite(n)?n:d; };
const str = (v:any, d:string)=> (typeof v==='string'&&v.length?v:d);
const csvList = (v:any)=> typeof v==='string' && v ? v.split(",").map(s=>s.trim()).filter(Boolean) : [];

// simple country presets (center & zoom)
const COUNTRY_PRESETS: Record<string, {lat:number; lng:number; z:number; radius:number}> = {
  GB: { lat: 52.5, lng: -1.5, z: 7, radius: 400 },
  IE: { lat: 53.4, lng: -8.1, z: 7, radius: 350 },
  FR: { lat: 46.7, lng: 2.5,  z: 6, radius: 550 },
  DE: { lat: 51.2, lng: 10.5, z: 6, radius: 550 },
  NL: { lat: 52.3, lng: 5.3,  z: 7, radius: 300 },
  BE: { lat: 50.8, lng: 4.6,  z: 7, radius: 300 },
  ES: { lat: 40.3, lng: -3.7, z: 6, radius: 700 },
  IT: { lat: 42.9, lng: 12.5, z: 6, radius: 600 },
};

function radiusForZoom(z:number){
  const table = [
    {z:5, r:1200},{z:6, r:700},{z:7, r:400},{z:8, r:250},
    {z:9, r:150},{z:10, r:90},{z:11, r:45},{z:12, r:22},{z:13, r:12}
  ];
  let r = 400;
  for(const row of table){ if(z<=row.z){ r=row.r; break; } r=row.r; }
  return r;
}

// shares calculator (for drawer)
const WEIGHTS = { reports: 0.5, downtime: 0.3, connectors: 0.2 };
function sharesFromBreakdown(b?: {reports:number;downtime:number;connectors:number}) {
  if (!b) return { reports: 0, downtime: 0, connectors: 0 };
  const cRep = b.reports * WEIGHTS.reports;
  const cDown = b.downtime * WEIGHTS.downtime;
  const cConn = b.connectors * WEIGHTS.connectors;
  const total = cRep + cDown + cConn;
  if (total <= 1e-9) return { reports: 0, downtime: 0, connectors: 0 };
  const rep = Math.round((cRep/total)*100);
  const down = Math.round((cDown/total)*100);
  let conn = 100 - rep - down; // ensure sums to 100
  if (conn < 0) conn = 0;
  return { reports: rep, downtime: down, connectors: conn };
}

export default function EVPage() {
  const router = useRouter();
  const q = router.query;

  // URL-backed states
  const [cc, setCC] = React.useState<string>((str(q.cc, "GB")).toUpperCase());
  const [halfReports, setHalfReports] = React.useState<number>(num(q.hr, 90));
  const [halfDown,   setHalfDown]   = React.useState<number>(num(q.hd, 60));
  const [ui, setUI] = React.useState<{scale: "robust"|"linear"|"log"; radius: number; blur: number}>({
    scale: (str(q.s, "robust") as any),
    radius: num(q.r, 60),
    blur: num(q.b, 35),
  });
  const [filters, setFilters] = React.useState<{
    operator: string; dcOnly: boolean; minKW: number; minConn: number; types: string[];
  }>({
    operator: str(q.op, "any"),
    dcOnly: parseBool(q.dc, false),
    minKW: num(q.kw, 0),
    minConn: num(q.mc, 0),
    types: csvList(q.ct),
  });
  const [view, setView] = React.useState<{lat:number; lng:number; z:number}>({
    lat: num(q.lat, COUNTRY_PRESETS[cc]?.lat ?? 51.5074),
    lng: num(q.lng, COUNTRY_PRESETS[cc]?.lng ?? -0.1278),
    z:   num(q.z,   COUNTRY_PRESETS[cc]?.z   ?? 7),
  });

  // optional: initial selected hotspot from query
  const selectedInit = React.useMemo(() => {
    const hlat = q.hlat, hlng = q.hlng;
    if(hlat===undefined || hlng===undefined) return null;
    return { lat: Number(hlat), lng: Number(hlng) };
  }, [q.hlat, q.hlng]);

  // data
  const [points, setPoints] = React.useState<Point[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // selected (for the drawer)
  const [selected, setSelected] = React.useState<Point | null>(null);

  // fetcher
  const fetchData = React.useCallback(async (opts?: { silent?: boolean; lat?:number; lon?:number; radius?:number }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const lat = opts?.lat ?? view.lat;
      const lon = opts?.lon ?? view.lng;
      const radius = opts?.radius ?? radiusForZoom(view.z);
      const url = `/api/ev-points?cc=${cc}&lat=${lat}&lon=${lon}&radius=${radius}&halfReports=${halfReports}&halfDown=${halfDown}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`API ${r.status}`);
      const data = await r.json();
      setPoints(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [cc, halfReports, halfDown, view.lat, view.lng, view.z]);

  // first load (silent)
  React.useEffect(() => { fetchData({ silent: true }); }, []); // eslint-disable-line

  // debounced refetch on view/half-lives/country change
  React.useEffect(() => {
    const id = setTimeout(() => {
      fetchData({ silent: true });
    }, 300);
    return () => clearTimeout(id);
  }, [view.lat, view.lng, view.z, cc, halfReports, halfDown, fetchData]);

  // operators list for filter
  const operatorOptions = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of points) counts.set((p.op || "Unknown"), (counts.get((p.op || "Unknown")) || 0) + 1);
    const arr = Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).map(([k])=>k);
    return ["any", ...arr];
  }, [points]);

  // shareable URL
  const pushUrl = React.useCallback(() => {
    const params = new URLSearchParams();
    params.set("cc", cc);
    params.set("hr", String(halfReports));
    params.set("hd", String(halfDown));
    params.set("s", ui.scale);
    params.set("r", String(ui.radius));
    params.set("b", String(ui.blur));
    params.set("op", filters.operator || "any");
    params.set("dc", filters.dcOnly ? "1" : "0");
    params.set("kw", String(filters.minKW || 0));
    params.set("mc", String(filters.minConn || 0));
    if (filters.types.length) params.set("ct", filters.types.join(","));
    params.set("lat", String(view.lat.toFixed(5)));
    params.set("lng", String(view.lng.toFixed(5)));
    params.set("z", String(view.z));
    if (selected) { params.set("hlat", String(selected.lat)); params.set("hlng", String(selected.lng)); }
    router.replace({ pathname: "/ev", query: Object.fromEntries(params) }, undefined, { shallow: true });
  }, [router, cc, halfReports, halfDown, ui.scale, ui.radius, ui.blur, filters.operator, filters.dcOnly, filters.minKW, filters.minConn, filters.types, view.lat, view.lng, view.z, selected]);

  React.useEffect(() => { pushUrl(); }, [pushUrl]);

  // geolocate
  const geolocate = () => {
    if (!navigator.geolocation) return alert("Geolocation not supported.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setView({ lat: latitude, lng: longitude, z: 9 });
        fetchData({ lat: latitude, lon: longitude, radius: radiusForZoom(9) });
      },
      () => alert("Unable to get your location.")
    );
  };

  // simple place search via Nominatim
  const [search, setSearch] = React.useState("");
  const goSearch = async () => {
    if (!search.trim()) return;
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(search)}&limit=1`);
      const data = await resp.json();
      if (!data?.[0]) return alert("Place not found");
      const lat = Number(data[0].lat), lon = Number(data[0].lon);
      setView({ lat, lng: lon, z: 9 });
      fetchData({ lat, lon, radius: radiusForZoom(9) });
    } catch {
      alert("Search failed");
    }
  };

  // change country preset
  const changeCountry = (newCC: string) => {
    const p = COUNTRY_PRESETS[newCC] || COUNTRY_PRESETS.GB;
    setCC(newCC);
    setView({ lat: p.lat, lng: p.lng, z: p.z });
    fetchData({ lat: p.lat, lon: p.lng, radius: p.radius });
  };

  // refetch for current view center/zoom (manual)
  const refetchForView = () => {
    fetchData({ lat: view.lat, lon: view.lng, radius: radiusForZoom(view.z) });
  };

  // when a hotspot is selected, keep local & write url
  const onSelectChange = (p: Point | null) => {
    setSelected(p);
    const curr = new URLSearchParams(router.query as any);
    if (p) { curr.set("hlat", String(p.lat)); curr.set("hlng", String(p.lng)); }
    else { curr.delete("hlat"); curr.delete("hlng"); }
    router.replace({ pathname: "/ev", query: Object.fromEntries(curr) }, undefined, { shallow: true });
  };

  // drawer copy link
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert("Link copied!");
    } catch {
      alert("Could not copy link");
    }
  };

  const typeChecked = (t: string) => filters.types.includes(t);
  const toggleType = (t: string) =>
    setFilters(f => {
      const has = f.types.includes(t);
      return { ...f, types: has ? f.types.filter(x => x !== t) : [...f.types, t] };
    });

  return (
    <div style={{ position: "relative" }}>
      {/* Top-right control bar */}
      <div style={{
        position: "absolute", right: 16, top: 12, zIndex: 1100,
        background: "rgba(255,255,255,0.95)", padding: "10px 12px",
        borderRadius: 12, boxShadow: "0 2px 10px rgba(0,0,0,0.08)", fontSize: 12,
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", maxWidth: 980
      }}>
        <div><b>Live OCM data</b> • {points.length.toLocaleString()} points</div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label>Country</label>
          <select value={cc} onChange={e => changeCountry(e.target.value)}>
            {Object.keys(COUNTRY_PRESETS).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label>Reports HL</label>
          <input type="number" min={7} max={365} step={1} value={halfReports}
                 onChange={e => setHalfReports(Math.max(7, Math.min(365, +e.target.value || 0)))} style={{ width: 60 }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label>Downtime HL</label>
          <input type="number" min={7} max={365} step={1} value={halfDown}
                 onChange={e => setHalfDown(Math.max(7, Math.min(365, +e.target.value || 0)))} style={{ width: 60 }} />
        </div>

        <button onClick={() => fetchData()} style={{ border: "1px solid #ddd", background: "#f8fafc", borderRadius: 10, padding: "6px 10px", cursor: "pointer" }}>
          Refresh
        </button>

        <div style={{ width: "100%", height: 0 }} />

        {/* Filters — existing */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label>Network</label>
          <select value={filters.operator} onChange={e => setFilters(f => ({ ...f, operator: e.target.value }))}>
            {operatorOptions.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label>DC only</label>
          <input type="checkbox" checked={filters.dcOnly} onChange={e => setFilters(f => ({ ...f, dcOnly: e.target.checked }))} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label>Min kW</label>
          <input type="number" min={0} max={400} step={10} value={filters.minKW}
                 onChange={e => setFilters(f => ({ ...f, minKW: Math.max(0, +e.target.value || 0) }))} style={{ width: 70 }} />
        </div>

        {/* Filters — NEW */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label>Min connectors</label>
          <input type="number" min={0} max={50} step={1} value={filters.minConn}
                 onChange={e => setFilters(f => ({ ...f, minConn: Math.max(0, +e.target.value || 0) }))} style={{ width: 60 }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Types:</span>
          {["CCS","CHAdeMO","Type 2","Tesla"].map(t => (
            <label key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={typeChecked(t)} onChange={() => toggleType(t)} /> {t}
            </label>
          ))}
        </div>

        {/* Search + locate + refetch-for-view */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            placeholder="Search place (city, postcode)…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => (e.key === 'Enter') && goSearch()}
            style={{ width: 220 }}
          />
          <button onClick={goSearch} style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 10, padding: "6px 10px", cursor: "pointer" }}>Go</button>
          <button onClick={geolocate} style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 10, padding: "6px 10px", cursor: "pointer" }}>Geolocate</button>
          <button onClick={refetchForView} title="Refetch for current map center & zoom"
                  style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 10, padding: "6px 10px", cursor: "pointer" }}>
            Refetch (view)
          </button>
        </div>

        <a
          href={`/ev?${new URLSearchParams(router.query as Record<string,string>).toString()}`}
          style={{ marginLeft: "auto", textDecoration: "none", color: "#2563eb" }}
          title="Copy link to current view & settings"
        >
          Share link
        </a>
      </div>

      {loading && (
        <div style={{ height: "80vh", display: "grid", placeItems: "center" }}>
          <span>Loading live EV data…</span>
        </div>
      )}

      {error && (
        <div style={{ height: "80vh", display: "grid", placeItems: "center", color: "#b91c1c" }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Failed to load</div>
            <code>{error}</code>
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          <HeatmapWithScaling
            points={points}
            meta={{ halfReports, halfDown }}
            filters={filters}
            initialUI={ui}
            onUIChange={(u) => setUI(u)}
            onViewportChange={(c, z) => setView({ lat: c[0], lng: c[1], z })}
            selectedInit={selectedInit}
            onSelectChange={onSelectChange}
          />

          {/* Right-side details drawer */}
          {selected && (
            <div style={{
              position: "absolute", top: 80, right: 16, zIndex: 1200,
              width: 320, background: "rgba(255,255,255,0.98)", borderRadius: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 12, fontSize: 13
            }}>
              <div style={{ display: "flex", alignItems: "start", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
                  {selected.name || "Hotspot"}
                </div>
                <button
                  onClick={() => onSelectChange(null)}
                  style={{ marginLeft: "auto", border: "1px solid #ddd", borderRadius: 8, padding: "4px 8px", background: "#fff", cursor: "pointer" }}
                >
                  Close
                </button>
              </div>
              <div style={{ marginTop: 6 }}>
                <div><b>Score</b>: {selected.value.toFixed(2)}</div>
                <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <div><b>Operator</b><br/>{selected.op || "Unknown"}</div>
                  <div><b>Fast/DC</b><br/>{selected.dc ? "Yes" : "No"}</div>
                  <div><b>Max kW</b><br/>{selected.kw ?? 0}</div>
                  <div><b>Connectors</b><br/>{selected.conn ?? 0}</div>
                  <div style={{ gridColumn: "1 / span 2" }}><b>Types</b><br/>{(selected.types||[]).join(", ") || "—"}</div>
                </div>
                {selected.breakdown && (
                  <div style={{ marginTop: 8, opacity: 0.9 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Score breakdown</div>
                    {(() => {
                      const s = sharesFromBreakdown(selected.breakdown);
                      return (
                        <ul style={{ paddingLeft: 16, margin: 0 }}>
                          <li>Reports: {s.reports}%</li>
                          <li>Downtime: {s.downtime}%</li>
                          <li>Connectors: {s.connectors}%</li>
                        </ul>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <a
                  href={`https://www.google.com/maps?q=${selected.lat},${selected.lng}`}
                  target="_blank" rel="noreferrer"
                  style={{ border: "1px solid #ddd", borderRadius: 8, padding: "6px 10px", textDecoration: "none", color: "#111", background: "#fff" }}
                >
                  Open in Google Maps
                </a>
                <button
                  onClick={copyLink}
                  style={{ border: "1px solid #ddd", borderRadius: 8, padding: "6px 10px", background: "#fff", cursor: "pointer" }}
                >
                  Copy link
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
