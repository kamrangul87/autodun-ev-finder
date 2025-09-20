// app/model1-heatmap/page.tsx
"use client";

import React, {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import { type OCMStation, featuresFor, scoreFor } from "../../lib/model1";
import FeedbackModal from "../components/FeedbackModal";

/* ------------------------------------------------------------------ */
/* React-Leaflet (client only)                                        */
/* ------------------------------------------------------------------ */
const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(() => import("react-leaflet").then((m) => m.Marker), {
  ssr: false,
});
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), {
  ssr: false,
});

/* ------------------------------------------------------------------ */
/* Types & constants                                                   */
/* ------------------------------------------------------------------ */
type HeatPoint = [number, number, number];
interface StationWithScore extends OCMStation {
  _score: number;
}
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
const coerceArray = <T,>(x: unknown): T[] =>
  Array.isArray(x) ? (x as T[]) : [];

function normalizeToStation(obj: any): OCMStation | null {
  // Already OCM shape
  if (obj?.AddressInfo?.Latitude != null) return obj as OCMStation;

  // Our /api/sites fallback shape
  if (typeof obj?.lat === "number" && typeof obj?.lon === "number") {
    return {
      ID: obj.id ?? null,
      AddressInfo: {
        Title: obj.name ?? "EV charge point",
        Latitude: obj.lat,
        Longitude: obj.lon,
        Postcode: obj.postcode ?? null,
        AddressLine1: obj.addr ?? null,
        Town: null,
        StateOrProvince: null,
        CountryID: null,
        DistanceUnit: 0,
        Distance: 0,
        RelatedURL: null,
        ContactEmail: null,
        ContactTelephone1: null,
      },
      Connections: Array(
        typeof obj.connectors === "number" ? obj.connectors : 1
      ).fill({
        PowerKW:
          typeof obj.maxPowerKw === "number" ? obj.maxPowerKw : undefined,
      }),
      StatusType: { IsOperational: obj.status ? obj.status !== "down" : null } as any,
    } as OCMStation;
  }
  return null;
}

function bboxFromCenter(lat: number, lon: number, distKm: number) {
  const dLat = distKm / 111.32;
  const dLon = distKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { west: lon - dLon, south: lat - dLat, east: lon + dLon, north: lat + dLat };
}

/* ------------------------------------------------------------------ */
/* Heat overlay using leaflet.heat (robust, adds & removes cleanly)    */
/* ------------------------------------------------------------------ */
function HeatOverlay({
  points,
  mapRef,
}: {
  points: HeatPoint[];
  mapRef: MutableRefObject<any>;
}) {
  useEffect(() => {
    let layer: any = null;
    let cancelled = false;

    (async () => {
      // Only mount when we have a map and some points
      if (!mapRef.current || points.length === 0) return;

      const L = (await import("leaflet")).default as any;
      await import("leaflet.heat"); // side-effect: registers L.heatLayer

      if (cancelled) return;

      layer = (L as any).heatLayer(points, {
        radius: 45,
        blur: 25,
        maxZoom: 17,
        max: 1.0,
        minOpacity: 0.35,
      });
      try {
        layer.addTo(mapRef.current);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      try {
        if (layer && mapRef.current) {
          mapRef.current.removeLayer(layer);
        }
      } catch {
        /* ignore */
      }
    };
  }, [points, mapRef]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function Model1HeatmapPage() {
  // Defaults (London)
  const [params] = useState(() => {
    if (typeof window === "undefined")
      return { lat: 51.5074, lon: -0.1278, dist: 25 };
    const sp = new URLSearchParams(window.location.search);
    const lat = parseFloat(sp.get("lat") || "51.5074");
    const lon = parseFloat(sp.get("lon") || "-0.1278");
    const dist = parseFloat(sp.get("dist") || "25");
    return {
      lat: Number.isFinite(lat) ? lat : 51.5074,
      lon: Number.isFinite(lon) ? lon : -0.1278,
      dist: Number.isFinite(dist) ? dist : 25,
    };
  });

  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  // Seed bounds immediately so first fetch happens without waiting for 'ready'
  const [bounds, setBounds] = useState<{
    north: number;
    south: number;
    east: number;
    west: number;
  } | null>(bboxFromCenter(51.5074, -0.1278, 25));

  const [stations, setStations] = useState<StationWithScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [searchText, setSearchText] = useState("");

  // Feedback modal state
  const [fbOpen, setFbOpen] = useState(false);
  const [fbStationId, setFbStationId] = useState<string | null>(null);

  // Use a callback ref so React-Leaflet doesn't try to access stale refs
  const setMapRef = useCallback((m: any) => {
    mapRef.current = m || null;
    if (m) setMapReady(true);
  }, []);

  // Track bounds whenever the map moves
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    let timer: any = null;
    const update = () => {
      // Throttle slightly to avoid spamming requests while panning
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const b = map.getBounds?.();
          if (!b) return;
          setBounds({
            north: b.getNorth(),
            south: b.getSouth(),
            east: b.getEast(),
            west: b.getWest(),
          });
        } catch (e) {
          console.warn("[map] bounds read failed", e);
        }
      }, 120);
    };

    update();
    try {
      map.on?.("moveend", update);
      map.on?.("zoomend", update);
    } catch (e) {
      console.warn("[map] attach failed", e);
    }

    return () => {
      clearTimeout(timer);
      try {
        map.off?.("moveend", update);
        map.off?.("zoomend", update);
      } catch {
        /* ignore */
      }
    };
  }, [mapReady]);

  // Fetch stations whenever bbox changes
  useEffect(() => {
    if (!bounds) return;

    let abort = false;
    (async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const { west, south, east, north } = bounds;
        const url = `${API_BASE}/api/sites?bbox=${west},${south},${east},${north}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`API ${r.status}`);
        const raw = await r.json();
        const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.sites) ? raw.sites : [];
        const scored: StationWithScore[] = coerceArray<any>(arr)
          .map((x) => normalizeToStation(x))
          .filter(Boolean)
          .map((s) => {
            const sc = scoreFor(featuresFor(s!));
            return Object.assign({}, s!, { _score: sc }) as StationWithScore;
          });

        if (!abort) setStations(scored);
      } catch (e: any) {
        console.error(e);
        if (!abort) {
          setStations([]);
          setErrMsg(e?.message || "Failed to load stations");
        }
      } finally {
        if (!abort) setLoading(false);
      }
    })();

    return () => {
      abort = true;
    };
  }, [bounds]);

  // Build heat points with normalised weights
  const heatPoints: HeatPoint[] = useMemo(() => {
    if (!stations.length) return [];
    const values = stations.map((s) => s._score);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const denom = max - min || 1;
    return stations.map((s) => [
      s.AddressInfo!.Latitude as number,
      s.AddressInfo!.Longitude as number,
      (s._score - min) / denom,
    ]);
  }, [stations]);

  // Marker icons
  const [operationalIcon, offlineIcon] = useMemo(() => {
    if (typeof window === "undefined") return [undefined, undefined];
    const L = require("leaflet");
    const ok = L.divIcon({
      html:
        '<div style="width:14px;height:14px;background:#22c55e;border-radius:50%;border:2px solid #fff;"></div>',
      iconSize: [18, 18],
      className: "",
    });
    const off = L.divIcon({
      html:
        '<div style="width:14px;height:14px;background:#ef4444;border-radius:50%;border:2px solid #fff;"></div>',
      iconSize: [18, 18],
      className: "",
    });
    return [ok, off];
  }, []);

  // Search (OpenStreetMap Nominatim)
  const runSearch = async () => {
    const q = searchText.trim();
    if (!q || !mapRef.current) return;
    try {
      const u = new URL("https://nominatim.openstreetmap.org/search");
      u.searchParams.set("q", q);
      u.searchParams.set("format", "jsonv2");
      u.searchParams.set("limit", "1");
      const r = await fetch(u.toString());
      const rows = (await r.json()) as any[];
      if (rows?.length) {
        const lat = parseFloat(rows[0].lat);
        const lon = parseFloat(rows[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          mapRef.current.setView([lat, lon], 13);
        }
      }
    } catch (e) {
      console.warn("search failed", e);
    }
  };

  const mapCenter: [number, number] = [params.lat, params.lon];

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      {/* Controls */}
      <div
        style={{
          position: "absolute",
          top: "0.5rem",
          left: "0.5rem",
          zIndex: 1000,
          background: "rgba(12,19,38,0.95)",
          padding: "0.75rem",
          borderRadius: "0.5rem",
          color: "#f9fafb",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
          Autodun EV Map
        </h1>
        <div
          style={{
            marginTop: "0.5rem",
            display: "flex",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => {
              navigator.geolocation?.getCurrentPosition((pos) => {
                mapRef.current?.setView(
                  [pos.coords.latitude, pos.coords.longitude],
                  13
                );
              });
            }}
            style={btn}
          >
            Use my location
          </button>
          <button
            onClick={() => mapRef.current?.setView(mapCenter, 13)}
            style={btn}
          >
            Reset view
          </button>
          <button onClick={() => setShowHeatmap((v) => !v)} style={btn}>
            {showHeatmap ? "Markers" : "Heatmap"}
          </button>
          <input
            placeholder="Search postcode or area (e.g. EC1A, Westminster)"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            style={input}
          />
          <button onClick={runSearch} style={btn}>
            Search
          </button>
        </div>
      </div>

      {/* Map */}
      <main style={{ height: "100%", width: "100%" }}>
        <MapContainer
          center={mapCenter}
          zoom={13}
          scrollWheelZoom
          ref={setMapRef as unknown as MutableRefObject<any>}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Real heat overlay (leaflet.heat) */}
          {showHeatmap && heatPoints.length > 0 && (
            <HeatOverlay points={heatPoints} mapRef={mapRef} />
          )}

          {/* Markers */}
          {!showHeatmap &&
            stations.map((s, i) => {
              const lat = s.AddressInfo!.Latitude as number;
              const lon = s.AddressInfo!.Longitude as number;
              const op = s?.StatusType?.IsOperational;
              return (
                <Marker
                  key={`${s.ID ?? i}-${lat}-${lon}`}
                  position={[lat, lon]}
                  icon={
                    op == null
                      ? undefined
                      : op
                      ? (operationalIcon as any)
                      : (offlineIcon as any)
                  }
                >
                  <Popup>
                    <strong>{s.AddressInfo?.Title || "EV site"}</strong>
                    <br />
                    {s.AddressInfo?.Postcode ?? ""}
                    <br />
                    Max power:{" "}
                    {s.Connections?.reduce(
                      (m: number, c: any) =>
                        Math.max(m, Number(c?.PowerKW || 0)),
                      0
                    ) || "—"}{" "}
                    kW
                    <br />
                    Score: {s._score.toFixed(2)}
                    <br />
                    <button
                      className="mt-2"
                      style={{
                        marginTop: "0.5rem",
                        padding: "0.35rem 0.6rem",
                        borderRadius: "0.35rem",
                        border: "1px solid #92400e",
                        background: "#fbbf24",
                        color: "#111827",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        const id =
                          s.ID != null
                            ? String(s.ID)
                            : `${lat},${lon}`;
                        setFbStationId(id);
                        setFbOpen(true);
                      }}
                    >
                      Report status / feedback
                    </button>
                  </Popup>
                </Marker>
              );
            })}
        </MapContainer>

        {/* UI states */}
        {!loading && !errMsg && stations.length === 0 && (
          <div style={empty}>No stations here. Pan/zoom or try a search.</div>
        )}
        {errMsg && <div style={empty}>{errMsg}</div>}
      </main>

      {/* Feedback Modal */}
      <FeedbackModal
        stationId={fbStationId}
        open={fbOpen}
        onClose={() => setFbOpen(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styling                                                             */
/* ------------------------------------------------------------------ */
const btn: React.CSSProperties = {
  padding: "0.35rem 0.6rem",
  fontSize: "0.8rem",
  border: "1px solid #374151",
  borderRadius: "0.35rem",
  background: "#1f2937",
  color: "#f9fafb",
  cursor: "pointer",
};

const input: React.CSSProperties = {
  padding: "0.35rem 0.5rem",
  fontSize: "0.85rem",
  border: "1px solid #374151",
  borderRadius: "0.35rem",
  background: "#0b1220",
  color: "#f9fafb",
  minWidth: 320,
};

const empty: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  padding: "1rem",
  background: "rgba(0,0,0,0.7)",
  borderRadius: "0.5rem",
  color: "#f9fafb",
  fontSize: "0.9rem",
  zIndex: 1000,
  textAlign: "center",
  maxWidth: "80%",
};
