// pages/model1-heatmap.tsx
//
// This page renders an EV charging heatmap using the Model‑1 scoring functions
// from `lib/model1.ts`. It fetches charging stations from the existing
// `/api/stations` endpoint and then computes a score for each station based on
// its total power, maximum power and number of connectors. Those scores are
// normalised and passed to a Leaflet heat layer to visualise the relative
// intensity of charging infrastructure across an area. Stations are also
// displayed as markers with a popup containing basic details and the raw
// score.  A default view centres on London but you can adjust the latitude,
// longitude and radius by editing the query parameters in the URL (for
// example `?lat=53.48&lon=-2.24&dist=25` to focus on Manchester).

/* eslint react/no-unescaped-entities: off */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
// Import scoring helpers directly from the lib; these are purely
// computational and safe to import on both server and client.
import { featuresFor, scoreFor, type OCMStation } from '../lib/model1';

// Dynamically import leaflet components to avoid SSR issues.  The
// `ssr: false` option ensures they are only loaded on the client.
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),    { ssr: false });
const Marker       = dynamic(() => import('react-leaflet').then(m => m.Marker),       { ssr: false });
const Popup        = dynamic(() => import('react-leaflet').then(m => m.Popup),        { ssr: false });

// `useMap` cannot be imported dynamically because it is a hook; importing it
// here is acceptable since it doesn't reference the `window` object itself.
import { useMap } from 'react-leaflet';

import 'leaflet/dist/leaflet.css';

// -----------------------------------------------------------------------------
// Feedback form component
//
// This component renders a small feedback form allowing the user to select a
// rating (0–5 stars) and optionally provide a short comment.  On submit it
// posts the feedback to the API and then invokes a callback.  After
// submission a thank-you message is displayed.
function FeedbackForm({ stationId, onSubmitted }: { stationId: number; onSubmitted: () => void }) {
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, rating, comment }),
      });
      setSubmitted(true);
      onSubmitted();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };
  if (submitted) {
    return <p style={{ color: '#22c55e', fontSize: '0.75rem', marginTop: '0.5rem' }}>Thank you for your feedback!</p>;
  }
  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '0.5rem' }}>
      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Rating (0–5):</label>
      <select
        value={rating}
        onChange={(e) => setRating(parseInt(e.target.value, 10))}
        style={{
          padding: '0.25rem',
          fontSize: '0.75rem',
          border: '1px solid #374151',
          borderRadius: '0.25rem',
          background: '#1f2937',
          color: '#f9fafb',
          width: '100%',
          marginBottom: '0.25rem',
        }}
      >
        {[5, 4, 3, 2, 1, 0].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Comment:</label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment"
        style={{
          width: '100%',
          height: '3rem',
          padding: '0.25rem',
          fontSize: '0.75rem',
          border: '1px solid #374151',
          borderRadius: '0.25rem',
          background: '#0b1220',
          color: '#f9fafb',
          marginBottom: '0.25rem',
          resize: 'vertical',
        }}
      />
      <button
        type="submit"
        disabled={submitting}
        style={{
          padding: '0.25rem 0.5rem',
          fontSize: '0.75rem',
          border: '1px solid #374151',
          borderRadius: '0.25rem',
          background: submitting ? '#374151' : '#1f2937',
          color: '#f9fafb',
          cursor: submitting ? 'not-allowed' : 'pointer',
          width: '100%',
        }}
      >
        Submit
      </button>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Type helpers

type HeatPoint = [number, number, number];

interface StationWithScore extends OCMStation {
  _score: number;
  // Status information from the API (if available).  When provided this
  // object contains a `Title` (e.g. "Operational") and `IsOperational`
  // boolean.  These properties are optional because earlier versions of
  // the API did not include status data.
  StatusType?: {
    Title: string | null;
    IsOperational: boolean | null;
  };

  // Aggregated user feedback.  If no feedback exists, `count` will be 0 and
  // `averageRating`/`reliability` will be null.  Reliability is scaled to
  // [0,1] by dividing the average rating by 5.  These fields are optional
  // because older versions of the API may not include them.
  Feedback?: {
    count: number;
    averageRating: number | null;
    reliability: number | null;
  };

  // Data source flag.  When present this indicates whether the station
  // originated from OpenChargeMap ("OCM") or a council dataset ("Council").
  DataSource?: string;
}

// -----------------------------------------------------------------------------
// HeatLayer component
//
// This component wraps Leaflet's heat layer plugin.  It listens for
// `points` changes and (re)builds the heat layer on the current map.
function HeatLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();
  const layerRef = useRef<any>(null);
  useEffect(() => {
    let cancelled = false;
    async function mount() {
      if (cancelled) return;
      // Dynamically import Leaflet and its heat plugin; the plugin augments
      // Leaflet by adding a `heatLayer` factory on the module.  We import
      // within this effect to ensure `window` exists.
      const L = (await import('leaflet')).default as any;
      await import('leaflet.heat');
      // Remove previous layer if any
      if (layerRef.current && map) {
        try { map.removeLayer(layerRef.current); } catch { /* ignore */ }
        layerRef.current = null;
      }
      if (!map || points.length === 0) return;
      // Create a new heat layer with reasonable defaults
      const layer = (L as any).heatLayer(points, {
        radius: 45,
        blur: 25,
        maxZoom: 17,
        max: 1.0,
        minOpacity: 0.35,
      });
      layer.addTo(map);
      layerRef.current = layer;
    }
    mount();
    return () => {
      cancelled = true;
      if (layerRef.current && map) {
        try { map.removeLayer(layerRef.current); } catch { /* ignore */ }
        layerRef.current = null;
      }
    };
  }, [map, points]);
  return null;
}

// -----------------------------------------------------------------------------
// FeedbackForm component
//
// Renders a simple form allowing users to submit feedback for a specific
// station.  Users can select a rating between 1 and 5 and optionally leave
// a comment.  When the form is submitted it sends a POST request to the
// `/api/feedback` endpoint.  Once submitted the form disables further
// submissions and displays a thank‑you message.  An `onSubmitted` callback
// can be provided to refresh parent state (e.g. refetch station data).
function FeedbackForm({ stationId, onSubmitted }: { stationId: number; onSubmitted?: () => void }) {
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, rating, comment }),
      });
      setSubmitted(true);
      if (onSubmitted) onSubmitted();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#6ee7b7' }}>Thank you for your feedback!</p>;
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '0.5rem' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', color: '#f9fafb', marginBottom: '0.25rem' }}>
        Rating:
        <select
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          style={{
            marginLeft: '0.25rem',
            padding: '0.15rem 0.3rem',
            fontSize: '0.8rem',
            border: '1px solid #374151',
            borderRadius: '0.25rem',
            background: '#1f2937',
            color: '#f9fafb',
            cursor: 'pointer',
          }}
        >
          {[5, 4, 3, 2, 1, 0].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'block', fontSize: '0.8rem', color: '#f9fafb', marginBottom: '0.25rem' }}>
        Comment:
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          style={{
            display: 'block',
            width: '100%',
            padding: '0.25rem',
            marginTop: '0.15rem',
            fontSize: '0.8rem',
            border: '1px solid #374151',
            borderRadius: '0.25rem',
            background: '#1f2937',
            color: '#f9fafb',
            resize: 'vertical',
          }}
        />
      </label>
      <button
        type='submit'
        disabled={submitting}
        style={{
          padding: '0.25rem 0.5rem',
          fontSize: '0.8rem',
          border: '1px solid #374151',
          borderRadius: '0.25rem',
          background: submitting ? '#374151' : '#2563eb',
          color: '#f9fafb',
          cursor: submitting ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? 'Submitting…' : 'Submit'}
      </button>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Main page component

export default function Model1HeatmapPage() {
  // Read optional query parameters for lat/lon/dist from window.location.
  // Defaults: London (51.5074, -0.1278) with 25 km radius.  We read them in
  // a lazy state initialiser so that SSR doesn't attempt to access
  // `window`.
  const [params] = useState(() => {
    if (typeof window === 'undefined') {
      return { lat: 51.5074, lon: -0.1278, dist: 25 };
    }
    const sp = new URLSearchParams(window.location.search);
    const lat = parseFloat(sp.get('lat') || '51.5074');
    const lon = parseFloat(sp.get('lon') || '-0.1278');
    const dist = parseFloat(sp.get('dist') || '25');
    return {
      lat: Number.isFinite(lat) ? lat : 51.5074,
      lon: Number.isFinite(lon) ? lon : -0.1278,
      dist: Number.isFinite(dist) ? dist : 25,
    };
  });

  // Stations returned from the API along with their computed score
  const [stations, setStations] = useState<StationWithScore[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Track the current map bounds. When null, we fall back to the initial
  // lat/lon/dist from query params.  The bounds object contains north,
  // south, east and west properties.
  const [bounds, setBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  // Toggle between heatmap and marker views. Heatmap is shown by default.
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);

  // Selected connector type for filtering.  Empty string means "any".  The
  // available options correspond to the connector patterns recognised by
  // matchesConnector in the API: CCS, Type 2 and CHAdeMO.  Additional
  // strings can be supported in future.
  const [connFilter, setConnFilter] = useState<string>('');

  // Selected data source filter.  Empty string or 'all' means include both
  // OpenChargeMap and council datasets.  Users can select 'ocm' or 'council'
  // to view data from a single source.
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  // Track which station's feedback form is currently open.  When null no
  // feedback form is shown.  This allows at most one pop‑up form at a time.
  const [feedbackOpenId, setFeedbackOpenId] = useState<number | null>(null);

  // A counter that increments whenever a user submits feedback.  Changing
  // this value triggers a refetch of station data so that updated
  // reliability scores and feedback counts are reflected in the UI.
  const [feedbackVersion, setFeedbackVersion] = useState<number>(0);

  // Fetch stations whenever either the bounding box changes or the initial
  // parameters change.  If bounds is non-null we build a request with
  // north/south/east/west.  Otherwise we use lat/lon/dist from query params.
  useEffect(() => {
    async function fetchStations() {
      setLoading(true);
      setError(null);
      try {
        let url = '';
        if (bounds) {
          const { north, south, east, west } = bounds;
          url = `/api/stations?north=${north}&south=${south}&east=${east}&west=${west}`;
        } else {
          url = `/api/stations?lat=${params.lat}&lon=${params.lon}&dist=${params.dist}`;
        }
        // Append connector filter if provided.  We encode the value to ensure
        // spaces (e.g. "Type 2") are sent correctly.  The API interprets
        // lowercase values like "ccs", "chademo" or "type 2".
        if (connFilter) {
          url += `&conn=${encodeURIComponent(connFilter)}`;
        }
        // Append source filter if it isn't 'all'.  The API interprets
        // 'ocm' and 'council' values to limit results.
        if (sourceFilter && sourceFilter !== 'all') {
          url += `&source=${encodeURIComponent(sourceFilter)}`;
        }
        const res = await fetch(url, {
          cache: 'no-cache',
        });
        if (!res.ok) throw new Error(`API responded with ${res.status}`);
        const data: OCMStation[] = await res.json();
        // Compute scores and filter out stations with missing coordinates
        const scored: StationWithScore[] = data
          .map((s) => {
            const lat = s?.AddressInfo?.Latitude;
            const lon = s?.AddressInfo?.Longitude;
            if (typeof lat !== 'number' || typeof lon !== 'number') return null;
            const f = featuresFor(s);
            const sc = scoreFor(f);
            return Object.assign({}, s, { _score: sc });
          })
          .filter(Boolean) as StationWithScore[];
        setStations(scored);
      } catch (e: any) {
        setError(e?.message || 'Failed to load stations');
        setStations([]);
      } finally {
        setLoading(false);
      }
    }
    fetchStations();
  }, [bounds, params.lat, params.lon, params.dist, connFilter, sourceFilter, feedbackVersion]);

  // Prepare heat points by normalising the scores to [0,1].  If all scores
  // happen to be equal then every point will use weight 1.
  const heatPoints: HeatPoint[] = useMemo(() => {
    if (!stations.length) return [];
    const values = stations.map((s) => s._score);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const denom = max - min || 1;
    return stations.map((s) => {
      const lat = s.AddressInfo?.Latitude as number;
      const lon = s.AddressInfo?.Longitude as number;
      const w = (s._score - min) / denom;
      return [lat, lon, w] as HeatPoint;
    });
  }, [stations]);

  // Map reference used for controlling the view (optional)
  const mapRef = useRef<any>(null);

  // Precreate marker icons for operational vs. non-operational stations.  Using
  // divIcon avoids having to bundle custom image assets.  We create these
  // icons lazily on the client; during SSR they remain undefined.
  const [operationalIcon, offlineIcon] = useMemo(() => {
    if (typeof window === 'undefined') return [undefined, undefined];
    // Dynamically import Leaflet only when running in the browser.  We
    // intentionally avoid top‑level imports to prevent SSR issues.
    const L = require('leaflet');
    const ops = L.divIcon({
      html:
        '<div style="width: 14px; height: 14px; background: #22c55e; border-radius: 50%; border: 2px solid #ffffff;"></div>',
      iconSize: [18, 18],
      className: '',
    });
    const off = L.divIcon({
      html:
        '<div style="width: 14px; height: 14px; background: #ef4444; border-radius: 50%; border: 2px solid #ffffff;"></div>',
      iconSize: [18, 18],
      className: '',
    });
    return [ops, off];
  }, []);

  // When the map is ready, compute the initial bounds and set up event
  // listeners for move and zoom events.  On each change we update
  // the `bounds` state which triggers a refetch of station data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Helper to read current bounds from Leaflet and update state
    const update = () => {
      const b = map.getBounds();
      // Skip if bounds are undefined
      if (!b) return;
      setBounds({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    };
    // Set initial bounds when map first mounts
    update();
    // Attach event listeners
    map.on('moveend', update);
    map.on('zoomend', update);
    return () => {
      map.off('moveend', update);
      map.off('zoomend', update);
    };
  }, [mapRef]);

  // If there are no stations we still provide the default center
  const mapCenter: [number, number] = [params.lat, params.lon];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '1rem', background: '#0b1220', color: '#fff' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>EV Heatmap (Model‑1)</h1>
        <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Scores are computed using the Model‑1 algorithm (based on total power, maximum
          power and number of connectors). Use query parameters `lat`, `lon` and
          `dist` (in km) to explore different areas.
        </p>
        {loading && <p style={{ color: '#999', marginTop: '0.5rem' }}>Loading stations…</p>}
        {error && <p style={{ color: '#f87171', marginTop: '0.5rem' }}>{error}</p>}
        {/* Toggle and summary row */}
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowHeatmap((prev) => !prev)}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.875rem',
              border: '1px solid #374151',
              borderRadius: '0.25rem',
              background: '#1f2937',
              color: '#f9fafb',
              cursor: 'pointer',
            }}
          >
            {showHeatmap ? 'Show Markers' : 'Show Heatmap'}
          </button>
          {/* Connector filter dropdown */}
          <select
            value={connFilter}
            onChange={(e) => setConnFilter(e.target.value)}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.875rem',
              border: '1px solid #374151',
              borderRadius: '0.25rem',
              background: '#1f2937',
              color: '#f9fafb',
              cursor: 'pointer',
              appearance: 'none',
            }}
          >
            <option value="">All connectors</option>
            <option value="ccs">CCS</option>
            <option value="type 2">Type 2</option>
            <option value="chademo">CHAdeMO</option>
          </select>
          {/* Data source filter dropdown */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.875rem',
              border: '1px solid #374151',
              borderRadius: '0.25rem',
              background: '#1f2937',
              color: '#f9fafb',
              cursor: 'pointer',
              appearance: 'none',
            }}
          >
            <option value="all">All sources</option>
            <option value="ocm">OpenChargeMap</option>
            <option value="council">Council</option>
          </select>
          {!loading && !error && (
            <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
              Found {stations.length} stations {bounds ? 'in view' : `within ${params.dist} km`}
            </span>
          )}
        </div>
      </header>
      <main style={{ flexGrow: 1, position: 'relative' }}>
        {/* Map must only render on client; MapContainer is dynamic imported */}
        <MapContainer
          center={mapCenter}
          zoom={Math.max(11, Math.min(15, Math.log2(500 / params.dist)))}
          style={{ height: '100%', width: '100%' }}
          whenCreated={(map) => { mapRef.current = map; }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          />
          {/* Heat layer (rendered only when heatmap view is enabled) */}
          {showHeatmap && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}
          {/* Marker layer (rendered only when heatmap view is disabled) */}
          {!showHeatmap && stations.map((s, idx) => {
            const lat = s.AddressInfo?.Latitude as number;
            const lon = s.AddressInfo?.Longitude as number;
              const isOperational = typeof s.StatusType?.IsOperational === 'boolean' ? s.StatusType?.IsOperational : null;
              return (
                <Marker
                  key={idx}
                  position={[lat, lon]}
                  // Choose an icon based on operational status.  If status is
                  // unknown then fall back to the default Leaflet icon (undefined).
                  icon={isOperational === null ? undefined : isOperational ? operationalIcon : offlineIcon}
                >
                  <Popup>
                    <strong>{s.AddressInfo?.Title || 'Unnamed Station'}</strong>
                    <br />
                    {s.AddressInfo?.AddressLine1 || ''}
                    {s.AddressInfo?.Town ? `, ${s.AddressInfo.Town}` : ''}
                    {s.AddressInfo?.Postcode ? ` ${s.AddressInfo.Postcode}` : ''}
                    <br />
                    Score: {s._score.toFixed(2)}

                    {/* Indicate data source (OCM vs. Council) */}
                    {s.DataSource && (
                      <>
                        <br />
                        Source: {s.DataSource === 'Council' ? 'Council data' : 'OpenChargeMap'}
                      </>
                    )}
                    {s.StatusType?.Title && (
                      <>
                        <br />
                        Status: {s.StatusType.Title}
                        {typeof s.StatusType.IsOperational === 'boolean' && (
                          s.StatusType.IsOperational ? ' (Operational)' : ' (Not Operational)'
                        )}
                      </>
                    )}
                    {/* Show reliability and feedback count if available */}
                    {s.Feedback && s.Feedback.reliability != null && (
                      <>
                        <br />
                        Reliability: {(s.Feedback.reliability * 100).toFixed(0)}% ({s.Feedback.count} feedback)
                      </>
                    )}
                    {/* Feedback button or form */}
                    <div style={{ marginTop: '0.5rem' }}>
                      {feedbackOpenId === s.ID ? (
                        <FeedbackForm
                          stationId={s.ID as number}
                          onSubmitted={() => {
                            setFeedbackVersion((v) => v + 1);
                            setFeedbackOpenId(null);
                          }}
                        />
                      ) : (
                        <button
                          onClick={() => setFeedbackOpenId(s.ID as number)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            border: '1px solid #374151',
                            borderRadius: '0.25rem',
                            background: '#1f2937',
                            color: '#f9fafb',
                            cursor: 'pointer',
                          }}
                        >
                          Leave feedback
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
          })}
        </MapContainer>
        {/* Heatmap legend: displayed when heatmap is active */}
        {showHeatmap && (
          <div
            style={{
              position: 'absolute',
              bottom: '1rem',
              left: '1rem',
              padding: '0.5rem',
              background: 'rgba(0,0,0,0.6)',
              borderRadius: '0.25rem',
              color: '#f9fafb',
              fontSize: '0.75rem',
              zIndex: 1000,
            }}
          >
            <div
              style={{
                width: '160px',
                height: '10px',
                background:
                  'linear-gradient(to right, rgba(42,133,255,1) 0%, rgba(110,216,89,1) 25%, rgba(255,255,0,1) 50%, rgba(255,128,0,1) 75%, rgba(255,0,0,1) 100%)',
                marginBottom: '0.25rem',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}