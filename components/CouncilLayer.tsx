'use client';
import React, { useEffect, useState } from 'react';
import { GeoJSON } from 'react-leaflet';

export default function CouncilLayer({ url, color = '#14b8a6' }: { url: string; color?: string }) {
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) { setData(json); setErr(null); }
        console.info('[Council] features:', Array.isArray(json?.features) ? json.features.length : 0);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? 'Failed to load council data');
        console.warn('[Council] failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (!data) return err ? null : null;

  return (
    <GeoJSON
      data={data}
      style={() => ({
        color,
        weight: 3,              // make it obvious while testing
        opacity: 1,
        fillColor: '#00bcd4',
        fillOpacity: 0.12,
      })}
    />
  );
}
