'use client';

import React, { useEffect, useState } from 'react';
import { GeoJSON } from 'react-leaflet';

type Props = {
  /** Path in /public, e.g. "/data/council-test.geojson" */
  url: string;
  /** Stroke color */
  color?: string;
  /** Fill color */
  fillColor?: string;
  /** 0–1 fill opacity */
  fillOpacity?: number;
  /** Line weight */
  weight?: number;
};

export default function CouncilLayer({
  url,
  color = '#14b8a6',
  fillColor = '#14b8a6',
  fillOpacity = 0.10,
  weight = 2,
}: Props) {
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // One-time (per mount) cache-bust so CDN/browser don't serve stale file.
    // Bucket to a minute so we don't remount on small state changes.
    const bust = `v=${Math.floor(Date.now() / 60000)}`;
    const src = url.includes('?') ? `${url}&${bust}` : `${url}?${bust}`;

    (async () => {
      try {
        const res = await fetch(src, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setErr(null);
          // Debug: comment or keep as needed
          console.info(
            '[CouncilLayer] loaded features:',
            Array.isArray(json?.features) ? json.features.length : 0
          );
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message ?? 'Failed to load council data');
          console.warn('[CouncilLayer] failed:', e);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!data || err) return null;

  return (
    <GeoJSON
      data={data}
      style={() => ({
        color,
        weight,
        opacity: 1,
        fillColor,
        fillOpacity,
      })}
    />
  );
}
