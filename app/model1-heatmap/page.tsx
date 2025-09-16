// app/model1-heatmap/page.tsx
//
// This page renders an EV charging heatmap using the Model‑1 scoring functions
// from `lib/model1.ts`. It fetches charging stations from the `/api/stations`
// endpoint and computes a score for each station based on its total power,
// maximum power and number of connectors. Scores are normalised and passed
// to a Leaflet heat layer to visualise the relative intensity of charging
// infrastructure across an area. Stations are also displayed as markers with
// popups that include status, data source, reliability and a feedback form.

/* eslint react/no-unescaped-entities: off */

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { featuresFor, scoreFor, type OCMStation } from '../../lib/model1';
import { useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Dynamically import leaflet components to avoid SSR issues.
const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((m) => m.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then((m) => m.Popup), { ssr: false });

// Feedback form component for submitting user ratings and comments
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
        type="submit"
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

// Type definitions
type HeatPoint = [number, number, number];
interface StationWithScore extends OCMStation {
  _score: number;
  StatusType?: { Title: string | null; IsOperational: boolean | null };
  Feedback?: { count: number; averageRating: number | null; reliability: number | null };
  DataSource?: string;
}

// HeatLayer component to handle heatmap plugin
function HeatLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();
  const layerRef = useRef<any>(null);
  useEffect(() => {
    let cancelled = false;
    async function mount() {
      if (cancelled) return;
      const L = (await import('leaflet')).default as any;
      await import('leaflet.heat');
      if (layerRef.current && map) {
        try {
          map.removeLayer(layerRef.current);
        } catch {
          /* ignore */
        }
        layerRef.current = null;
      }
      if (!map || points.length === 0) return;
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
        try {
          map.removeLayer(layerRef.current);
        } catch {
          /* ignore */
        }
        layerRef.current = null;
      }
    };
  }, [map, points]);
  return null;
}

export default function Model1HeatmapPage() {
  // Read query params for default lat/lon/dist
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
  const [stations, setStations] = useState<StationWithScore[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [connFilter, setConnFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [feedbackOpenId, setFeedbackOpenId] = useState<number | null>(null);
  const [feedbackVersion, setFeedbackVersion] = useState<number>(0);

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
        if (connFilter) {
          url += `&conn=${encodeURIComponent(connFilter)}`;
        }
        if (sourceFilter && sourceFilter !== 'all') {
          url += `&source=${encodeURIComponent(sourceFilter)}`;
        }
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`API responded with ${res.status}`);
        const data: OCMStation[] = await res.json();
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

  const mapRef = useRef<any>(null);
  const [operationalIcon, offlineIcon] = useMemo(() => {
    if (typeof window === 'undefined') return [undefined, undefined];
    const L = require('leaflet');
    const ops = L.divIcon({
      html: '<div style="width: 14px; height: 14px; background: #22c55e; border-radius: 50%; border: 2px solid #ffffff;"></div>',
      iconSize: [18, 18],
      className: '',
    });
    const off = L.divIcon({
      html: '<div style="width: 14px; height: 14px; background: #ef4444; border-radius: 50%; border: 2px solid #ffffff;"></div>',
      iconSize: [18, 18],
      className: '',
    });
    return [ops, off];
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const b = map.getBounds();
      if (!b) return;
      setBounds({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    };
    update();
    map.on('moveend', update);
    map.on('zoomend', update);
    return () => {
      map.off('moveend', update);
      map.off('zoomend', update);
    };
  }, [mapRef]);

  const mapCenter: [number, number] = [params.lat, params.lon];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '1rem', background: '#0b1220', color: '#fff' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>EV Heatmap (Model‑1)</h1>
        <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Scores are computed using the Model‑1 algorithm (based on total power, maximum power and number of connectors).
          Use query parameters `lat`, `lon` and `dist` (in km) to explore different areas.
        </p>
        {loading && <p style={{ color: '#999', marginTop: '0.5rem' }}>Loading stations…</p>}
        {error && <p style={{ color: '#f87171', marginTop: '0.5rem' }}>{error}</p>}
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
        <MapContainer
          center={mapCenter}
          zoom={Math.max(11, Math.min(15, Math.log2(500 / params.dist)))}
          style={{ height: '100%', width: '100%' }}
          whenCreated={(map) => {
            mapRef.current = map;
          }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          />
          {showHeatmap && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}
          {!showHeatmap &&
            stations.map((s, idx) => {
              const lat = s.AddressInfo?.Latitude as number;
              const lon = s.AddressInfo?.Longitude as number;
              const isOperational = typeof s.StatusType?.IsOperational === 'boolean' ? s.StatusType?.IsOperational : null;
              return (
                <Marker
                  key={idx}
                  position={[lat, lon]}
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
                        {typeof s.StatusType.IsOperational === 'boolean' && (s.StatusType.IsOperational ? ' (Operational)' : ' (Not Operational)')}
                      </>
                    )}
                    {s.Feedback && s.Feedback.reliability != null && (
                      <>
                        <br />
                        Reliability: {(s.Feedback.reliability * 100).toFixed(0)}% ({s.Feedback.count} feedback)
                      </>
                    )}
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