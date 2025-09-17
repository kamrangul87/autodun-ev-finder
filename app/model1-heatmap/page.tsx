"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  MutableRefObject,
} from "react";
import dynamic from "next/dynamic";
import { type OCMStation, featuresFor, scoreFor } from "../../lib/model1";
import "leaflet/dist/leaflet.css";

// React-Leaflet (client only)
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

// -----------------------------------------
// Types
type HeatPoint = [number, number, number];

interface StationWithScore extends OCMStation {
  _score: number;
  DataSource?: string; // "ocm" | "council"
  Feedback?: {
    count: number;
    averageRating: number | null;
    reliability: number | null;
  };
}

// -----------------------------------------
// Utilities

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

function coerceArray<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

// If /api/sites returns simplified objects, convert to an OCMStation-ish shape
function normalizeToStation(obj: any): OCMStation | null {
  if (obj && obj.AddressInfo && typeof obj.AddressInfo?.Latitude === "number") {
    return obj as OCMStation; // already in OCM shape
  }
  if (obj && typeof obj.lat === "number" && typeof obj.lon === "number") {
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
      StatusType: {
        IsOperational: obj.status ? obj.status !== "down" : null,
        Title: obj.status ?? null,
        IsUserSelectable: null,
        ID: null,
      } as any,
    } as OCMStation;
  }
  return null;
}

// -----------------------------------------
// Heat layer (safe, no-throw)
function HeatLayer({ points, mapRef }: { points: HeatPoint[]; mapRef: any }) {
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const map = mapRef?.current;
        if (!map || !points.length) return;

        // (re)load plugin every time to be safe; it’s tiny.
        const L = (await import("leaflet")).default as any;
        await import("leaflet.heat");

        // remove old layer if any
        if (layerRef.current) {
          try {
            map.removeLayer(layerRef.current);
          } catch {
            /* ignore */
          }
          layerRef.current = null;
        }

        if (cancelled) return;

        if (typeof (L as any).heatLayer !== "function") {
          console.warn("[heat] leaflet.heat not available – skipping layer");
          return;
        }

        const layer = (L as any).heatLayer(points, {
          radius: 45,
          blur: 25,
          maxZoom: 17,
          max: 1.0,
          minOpacity: 0.35,
        });

        layer.addTo(map);
        layerRef.current = layer;
      } catch (err) {
        console.error("[heat] mount failed", err);
      }
    })();

    return () => {
      cancelled = true;
      const map = mapRef?.current;
      if (map && layerRef.current) {
        try {
          map.removeLayer(layerRef.current);
        } catch {
          /* ignore */
        }
      }
      layerRef.current = null;
    };
  }, [points, mapRef]);

  return null;
}

// -----------------------------------------
// Feedback form (unchanged logic, made robust)
function FeedbackForm({
  stationId,
  onSubmitted,
}: {
  stationId: number;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || done) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId, rating, comment }),
      });
      if (!r.ok) throw new Error("feedback failed");
      setDone(true);
      onSubmitted();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p style={{ color: "#22c55e", fontSize: "0.75rem", marginTop: "0.5rem" }}>
        Thank you for your feedback!
      </p>
    );
  }

  return (
    <form onSubmit={submit} style={{ marginTop: "0.5rem" }}>
      <label style={{ display: "block", fontSize: "0.75rem" }}>
        Rating (0–5)
      </label>
      <select
        value={rating}
        onChange={(e) => setRating(parseInt(e.target.value, 10))}
        style={{
          padding: "0.25rem",
          fontSize: "0.75rem",
          border: "1px solid #374151",
          borderRadius: "0.25rem",
          background: "#1f2937",
          color: "#f9fafb",
          width: "100%",
          marginBottom: "0.25rem",
        }}
      >
        {[5, 4, 3, 2, 1, 0].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

      <label style={{ display: "block", fontSize: "0.75rem" }}>Comment</label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional"
        style={{
          width: "100%",
          height: "3rem",
          padding: "0.25rem",
          fontSize: "0.75rem",
          border: "1px solid #374151",
          borderRadius: "0.25rem",
          background: "#0b1220",
          color: "#f9fafb",
          marginBottom: "0.25rem",
          resize: "vertical",
        }}
      />

      <button
        type="submit"
        disabled={busy}
        style={{
          padding: "0.25rem 0.5rem",
          fontSize: "0.75rem",
          border: "1px solid #374151",
          borderRadius: "0.25rem",
          background: busy ? "#374151" : "#1f2937",
          color: "#f9fafb",
          cursor: busy ? "not-allowed" : "pointer",
          width: "100%",
        }}
      >
        Submit
      </button>
    </form>
  );
}

// -----------------------------------------
// Page

export default function Model1HeatmapPage() {
  // default: London
  const [params] = useState(() => {
    if (typeof window === "undefined") {
      return { lat: 51.5074, lon: -0.1278, dist: 25 };
    }
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

  const [stations, setStations] = useState<StationWithScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [bounds, setBounds] = useState<{
    north: number;
    south: number;
    east: number;
    west: number;
  } | null>(null);

  const [showHeatmap, setShowHeatmap] = useState(true);
  const [searchText, setSearchText] = useState("");

  // Feedback refetch trigger
  const [fbTick, setFbTick] = useState(0);

  // Map ref (set safely)
  const mapRef = useRef<any>(null);
  const setMapRef = useCallback((map: any) => {
    mapRef.current = map;
  }, []);

  // Attach map event handlers SAFELY
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const update = () => {
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
    };

    try {
      // initial
      update();
      // subscribe
      map.on?.("moveend", update);
      map.on?.("zoomend", update);
    } catch (e) {
      console.warn("[map] attach failed", e);
    }

    return () => {
      try {
        map.off?.("moveend", update);
        map.off?.("zoomend", update);
      } catch {
        /* ignore */
      }
    };
  }, [mapRef.current]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch stations whenever bbox or params change
  useEffect(() => {
    let abort = false;
    (async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        let url = "";
        if (bounds) {
          const { west, south, east, north } = bounds;
          url = `${API_BASE}/api/sites?bbox=${west},${south},${east},${north}`;
        } else {
          url = `${API_BASE}/api/stations?lat=${params.lat}&lon=${params.lon}&dist=${params.dist}`;
        }

        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`API ${r.status}`);
        const raw = await r.json() as any;
        const arr =
          Array.isArray(raw) ? raw : Array.isArray(raw?.sites) ? raw.sites : [];

        // Normalize and score
        const scored: StationWithScore[] = coerceArray<any>(arr)
          .map((x) => normalizeToStation(x))
          .filter(Boolean)
          .map((s) => {
            const f = featuresFor(s!);
            const sc = scoreFor(f);
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
  }, [bounds, params.lat, params.lon, params.dist, fbTick]);

  // Heat points
  const heatPoints: HeatPoint[] = useMemo(() => {
    if (!stations.length) return [];
    const values = stations.map((s) => s._score);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const denom = max - min || 1;
    return stations.map((s) => {
      const lat = s.AddressInfo?.Latitude as number;
      const lon = s.AddressInfo?.Longitude as number;
      return [lat, lon, (s._score - min) / denom] as HeatPoint;
    });
  }, [stations]);

  // marker icons (safe)
  const [operationalIcon, offlineIcon] = useMemo(() => {
    if (typeof window === "undefined") return [undefined, undefined];
    const L = require("leaflet");
    const ops = L.divIcon({
      html:
        '<div style="width: 14px; height: 14px; background: #22c55e; border-radius: 50%; border: 2px solid #ffffff;"></div>',
      iconSize: [18, 18],
      className: "",
    });
    const off = L.divIcon({
      html:
        '<div style="width: 14px; height: 14px; background: #ef4444; border-radius: 50%; border: 2px solid #ffffff;"></div>',
      iconSize: [18, 18],
      className: "",
    });
    return [ops, off];
  }, []);

  // Search (Nominatim)
  const runSearch = async () => {
    const q = searchText.trim();
    if (!q) return;
    try {
      const u = new URL("https://nominatim.openstreetmap.org/search");
      u.searchParams.set("q", q);
      u.searchParams.set("format", "jsonv2");
      u.searchParams.set("limit", "1");
      const r = await fetch(u.toString(), {
        headers: { "User-Agent": "Autodun/1.0 (search)" },
      });
      const rows = (await r.json()) as any[];
      if (rows?.length) {
        const lat = parseFloat(rows[0].lat);
        const lon = parseFloat(rows[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lon) && mapRef.current) {
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
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition((pos) => {
                const { latitude, longitude } = pos.coords;
                mapRef.current?.setView([latitude, longitude], 13);
              });
            }}
            style={btn}
          >
            Use my location
          </button>
          <button onClick={() => mapRef.current?.setView(mapCenter, 13)} style={btn}>
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
          // **SAFE ref callback** – avoids the “_leaflet_events” crash
          ref={setMapRef as unknown as MutableRefObject<any>}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Heat layer */}
          {showHeatmap && heatPoints.length > 0 && (
            <HeatLayer points={heatPoints} mapRef={mapRef} />
          )}

          {/* Markers */}
          {!showHeatmap &&
            stations.map((s, i) => {
              const lat = s.AddressInfo?.Latitude as number;
              const lon = s.AddressInfo?.Longitude as number;
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
                    <div style={{ marginTop: "0.5rem" }}>
                      <FeedbackForm
                        stationId={(s.ID as number) ?? i}
                        onSubmitted={() => setFbTick((x) => x + 1)}
                      />
                    </div>
                  </Popup>
                </Marker>
              );
            })}
        </MapContainer>

        {/* Empty state */}
        {!loading && !errMsg && stations.length === 0 && (
          <div style={empty}>
            No stations found in this area. Try zooming out or moving the map.
          </div>
        )}
        {/* Error state */}
        {errMsg && (
          <div style={empty}>
            {errMsg}
          </div>
        )}
      </main>
    </div>
  );
}

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
