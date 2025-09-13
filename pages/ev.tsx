// pages/ev.tsx
'use client';

import React from "react";
import Head from "next/head";
import dynamic from "next/dynamic";

// Import the type only (no runtime import)
import type { Point } from "../components/HeatmapWithScaling";

// Dynamically import the map to avoid server-side "window is not defined"
const HeatmapWithScaling = dynamic(() => import("../components/HeatmapWithScaling"), {
  ssr: false,
});

// ---------- Small UI helpers ----------
function Spinner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      style={{
        display: "inline-block",
        width: 16,
        height: 16,
        border: "2px solid #ddd",
        borderTopColor: "#111",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}

// --- fetch helpers (timeout + abort) ---
function fetchJSON(url: string, opts: { signal?: AbortSignal; timeout?: number } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout ?? 10000);
  const signal = opts.signal ?? controller.signal;
  return fetch(url, { signal }).finally(() => clearTimeout(timer));
}

// Zoom → search radius (km). Larger radius for lower zooms.
function zoomToRadiusKm(z: number) {
  if (z >= 14) return 6;
  if (z >= 13) return 10;
  if (z >= 12) return 18;
  if (z >= 11) return 30;
  if (z >= 10) return 60;
  if (z >= 9) return 110;
  if (z >= 8) return 220;
  return 380; // z <= 7
}

// Simple debounce
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 400) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// ---------- Page ----------
export default function EVPage() {
  // ---------- UI state ----------
  const [points, setPoints] = React.useState<Point[]>([]);
  const [filteredCount, setFilteredCount] = React.useState<number>(0);

  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  // Viewport (center + zoom) – default London
  const [view, setView] = React.useState<{ lat: number; lng: number; z: number }>({
    lat: 51.5074, lng: -0.1278, z: 7,
  });

  // External center (from search) – when set, the map will fly there
  const [externalCenter, setExternalCenter] = React.useState<{ lat: number; lng: number; z?: number } | null>(null);

  // Filters (kept minimal – connector types, dcOnly, power, connectors)
  const [operator, setOperator] = React.useState<string>("any");
  const [dcOnly, setDcOnly] = React.useState<boolean>(false);
  const [minKW, setMinKW] = React.useState<number>(0);
  const [minConn, setMinConn] = React.useState<number>(0);
  const [typesSel, setTypesSel] = React.useState<string[]>(["CCS", "CHAdeMO", "Type 2", "Tesla"]);

  // Search box
  const [q, setQ] = React.useState<string>("");

  // Track in-flight request to cancel stale fetches
  const inFlight = React.useRef<AbortController | null>(null);

  // Build operator list from current points
  const operatorOptions = React.useMemo(() => {
    const set = new Map<string, number>();
    for (const p of points) {
      const op = (p.op || "Unknown").trim();
      set.set(op, (set.get(op) || 0) + 1);
    }
    const arr = Array.from(set.entries()).sort((a, b) => b[1] - a[1]).slice(0, 80);
    return [{ label: "Any operator", value: "any" }].concat(
      arr.map(([name, count]) => ({ label: `${name} (${count})`, value: name.toLowerCase() }))
    );
  }, [points]);

  // --------- DATA FETCH with cancel-on-stale ----------
  const doFetch = React.useCallback(async (
    { lat, lon, radius, showLoader = true }:
    { lat: number; lon: number; radius: number; showLoader?: boolean }
  ) => {
    try {
      // cancel the previous in-flight request (if any)
      if (inFlight.current) inFlight.current.abort();
      const ctrl = new AbortController();
      inFlight.current = ctrl;

      setError(null);
      showLoader && setLoading(true);

      const url = `/api/ev-points?lat=${lat}&lon=${lon}&distKm=${radius}`;
      const r = await fetchJSON(url, { signal: ctrl.signal, timeout: 10000 });
      if (!r.ok) throw new Error(`API ${r.status}`);
      const json = await r.json();
      if (ctrl.signal.aborted) return; // ignore stale response

      setPoints(json);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        console.error(e);
        setError(e?.message ?? "Network error");
      }
    } finally {
      if (!inFlight.current?.signal.aborted) setLoading(false);
    }
  }, []);

  // Initial load
  React.useEffect(() => {
    const radius = zoomToRadiusKm(view.z);
    doFetch({ lat: view.lat, lon: view.lng, radius, showLoader: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced fetch on viewport change
  const debouncedFetch = React.useRef(
    debounce((lat: number, lon: number, z: number) => {
      const radius = zoomToRadiusKm(z);
      doFetch({ lat, lon, radius, showLoader: false });
    }, 450)
  ).current;

  const handleViewportChange = React.useCallback((center: [number, number], z: number) => {
    setView({ lat: center[0], lng: center[1], z });
    debouncedFetch(center[0], center[1], z);
  }, [debouncedFetch]);

  // Search (Nominatim – GB only)
  const handleSearch = React.useCallback(async () => {
    const term = q.trim();
    if (!term) return;
    try {
      setLoading(true);
      setError(null);

      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(
        term
      )}`;
      const r = await fetch(url, { headers: { "Accept-Language": "en" } });
      const arr = await r.json();
      if (!Array.isArray(arr) || arr.length === 0) {
        setError("Location not found");
        setLoading(false);
        return;
      }
      const lat = parseFloat(arr[0].lat);
      const lon = parseFloat(arr[0].lon);
      const nextZ = 12; // good default for a town/postcode
      setExternalCenter({ lat, lng: lon, z: nextZ });

      // fetch for that new center immediately
      const radius = zoomToRadiusKm(nextZ);
      doFetch({ lat, lon, radius, showLoader: false });
    } catch (e: any) {
      console.error(e);
      setError("Search failed");
    } finally {
      setLoading(false);
    }
  }, [q, doFetch]);

  // Toggle connector type in local state
  const toggleType = (t: string) => {
    setTypesSel((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  return (
    <>
      <Head>
        <title>EV Hotspots — GB</title>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </Head>

      {/* Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2000,
          background: "#ffffff",
          borderBottom: "1px solid #eee",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "10px 12px",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Autodun EV Finder (GB)</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>
              Live OCM data • <b>{points.length}</b> sites • filtered: <b>{filteredCount}</b>
            </div>
            <Spinner show={loading} />
            {error ? (
              <span style={{ color: "#b91c1c", fontSize: 12, marginLeft: 6 }}>• {error}</span>
            ) : null}
          </div>

          {/* Search */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search town or postcode (GB)"
              style={{
                padding: "8px 10px",
                border: "1px solid #ddd",
                borderRadius: 8,
                minWidth: 260,
              }}
            />
            <button
              onClick={handleSearch}
              style={{
                padding: "8px 12px",
                border: "1px solid #ddd",
                borderRadius: 8,
                background: "#111",
                color: "#fff",
                fontWeight: 600,
              }}
            >
              Go
            </button>
          </div>
        </div>

        {/* Filters */}
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "10px 12px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
          }}
        >
          {/* Operators */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, opacity: 0.85 }}>Operator</label>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              style={{ padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8 }}
            >
              {operatorOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12, fontSize: 13 }}>
              <input type="checkbox" checked={dcOnly} onChange={() => setDcOnly((v) => !v)} />
              DC only
            </label>
          </div>

          {/* Power / Connectors */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, opacity: 0.85 }}>Min kW</label>
            <input
              type="number"
              min={0}
              max={350}
              value={minKW}
              onChange={(e) => setMinKW(Math.max(0, Number(e.target.value || 0)))}
              style={{ width: 80, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8 }}
            />
            <label style={{ fontSize: 12, opacity: 0.85 }}>Min connectors</label>
            <input
              type="number"
              min={0}
              max={20}
              value={minConn}
              onChange={(e) => setMinConn(Math.max(0, Number(e.target.value || 0)))}
              style={{ width: 80, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8 }}
            />
          </div>

          {/* Connector types */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {["CCS", "CHAdeMO", "Type 2", "Tesla"].map((t) => (
              <label key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={typesSel.includes(t)} onChange={() => toggleType(t)} />
                {t}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Map */}
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <HeatmapWithScaling
          points={points}
          filters={{
            operator,
            dcOnly,
            minKW,
            minConn,
            types: typesSel,
          }}
          initialUI={{ scale: "robust", radius: 60, blur: 35 }}
          onUIChange={() => {}}
          onViewportChange={handleViewportChange}
          onFilteredCountChange={(n) => setFilteredCount(n)}
          externalCenter={externalCenter}
          offsetTopPx={120}
        />
      </div>
    </>
  );
}
