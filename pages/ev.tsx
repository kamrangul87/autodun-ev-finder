// pages/ev.tsx
import React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import type { Point } from "../components/HeatmapWithScaling";

const HeatmapWithScaling = dynamic(() => import("../components/HeatmapWithScaling"), { ssr: false });

function parseBool(v: any, def=false){ if(v===undefined) return def; return v==='1'||v===1||v==='true'; }
function num(v:any, d:number){ const n=Number(v); return Number.isFinite(n)?n:d; }
function str(v:any, d:string){ return typeof v==='string'&&v.length?v:d; }

export default function EVPage() {
  const router = useRouter();

  // Data
  const [points, setPoints] = React.useState<Point[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Settings from URL (with defaults)
  const q = router.query;
  const [halfReports, setHalfReports] = React.useState<number>(num(q.hr, 90));
  const [halfDown,   setHalfDown]   = React.useState<number>(num(q.hd, 60));

  const [ui, setUI] = React.useState<{scale: "robust"|"linear"|"log"; radius: number; blur: number}>({
    scale: (str(q.s, "robust") as any),
    radius: num(q.r, 60),
    blur: num(q.b, 35),
  });

  const [filters, setFilters] = React.useState<{operator: string; dcOnly: boolean; minKW: number}>({
    operator: str(q.op, "any"),
    dcOnly: parseBool(q.dc, false),
    minKW: num(q.kw, 0),
  });

  // Viewport remembered in URL
  const [view, setView] = React.useState<{lat:number; lng:number; z:number}>({
    lat: num(q.lat, 51.5074), lng: num(q.lng, -0.1278), z: num(q.z, 7)
  });

  // Fetch
  const fetchData = React.useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const url = `/api/ev-points?halfReports=${halfReports}&halfDown=${halfDown}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`API ${r.status}`);
      const data = await r.json();
      setPoints(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [halfReports, halfDown]);

  React.useEffect(() => {
    fetchData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // initial

  // Unique operator list (sorted by frequency)
  const operatorOptions = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of points) counts.set((p.op || "Unknown"), (counts.get((p.op || "Unknown")) || 0) + 1);
    const arr = Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).map(([k])=>k);
    return ["any", ...arr];
  }, [points]);

  // Push state to URL (shareable)
  const pushUrl = React.useCallback(() => {
    const params = new URLSearchParams();
    params.set("hr", String(halfReports));
    params.set("hd", String(halfDown));
    params.set("s", ui.scale);
    params.set("r", String(ui.radius));
    params.set("b", String(ui.blur));
    params.set("op", filters.operator || "any");
    params.set("dc", filters.dcOnly ? "1" : "0");
    params.set("kw", String(filters.minKW || 0));
    params.set("lat", String(view.lat.toFixed(5)));
    params.set("lng", String(view.lng.toFixed(5)));
    params.set("z", String(view.z));
    router.replace({ pathname: "/ev", query: Object.fromEntries(params) }, undefined, { shallow: true });
  }, [router, halfReports, halfDown, ui.scale, ui.radius, ui.blur, filters.operator, filters.dcOnly, filters.minKW, view.lat, view.lng, view.z]);

  React.useEffect(() => { pushUrl(); }, [pushUrl]);

  return (
    <div style={{ position: "relative" }}>
      {/* Top-right controls/badge + filters */}
      <div style={{
        position: "absolute", right: 16, top: 12, zIndex: 1100,
        background: "rgba(255,255,255,0.95)", padding: "8px 10px",
        borderRadius: 12, boxShadow: "0 2px 10px rgba(0,0,0,0.08)", fontSize: 12,
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", maxWidth: 520
      }}>
        <div><b>Live OCM data</b> • {points.length.toLocaleString()} points</div>
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
        {/* Filters */}
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
        <HeatmapWithScaling
          points={points}
          meta={{ halfReports, halfDown }}
          filters={filters}
          initialUI={ui}
          onUIChange={(u) => setUI(u)}
          onViewportChange={(c, z) => setView({ lat: c[0], lng: c[1], z })}
        />
      )}
    </div>
  );
}
