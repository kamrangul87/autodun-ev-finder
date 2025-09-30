// components/CouncilLayer.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { GeoJSON } from 'react-leaflet';

type Props = {
  url: string;
  color?: string;
};

export default function CouncilLayer({ url, color = '#14b8a6' }: Props) {
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // cache-bust to avoid stale CDN/browser file
    const cacheBust = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;

    (async () => {
      try {
        const res = await fetch(cacheBust, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setErr(null);
          console.info(
            '[CouncilLayer] loaded:',
            Array.isArray(json?.features) ? json.features.length : 0,
            'features'
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

  if (!data) return err ? (
    <div
      style={{
        position: 'absolute',
        left: 8,
        bottom: 8,
        zIndex: 400,
        padding: '6px 10px',
        borderRadius: 8,
        background: 'rgba(255,0,0,0.85)',
        color: '#fff',
        fontSize: 12,
      }}
    >
      Council data not loaded
    </div>
  ) : null;

  // Make it very visible while testing
  return (
    <GeoJSON
      data={data}
      style={() => ({
        color,             // stroke
        weight: 3,         // thicker line so it stands out
        opacity: 1,
        fillColor: '#00bcd4',
        fillOpacity: 0.12, // slight tint so you can’t miss it
      })}
    />
  );
}
