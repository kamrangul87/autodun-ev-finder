// components/CouncilLayer.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { GeoJSON, Pane, useMap, useMapEvents } from 'react-leaflet';

// tiny debounce
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

type Props = {
  enabled: boolean;
  /** Hide below this zoom to avoid clutter */
  minZoom?: number;
};

export default function CouncilLayer({ enabled, minZoom = 9 }: Props) {
  const map = useMap();
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [seq, setSeq] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useMemo(
    () =>
      debounce(async () => {
        if (!enabled || !map) return;

        const z = map.getZoom();
        if (z < minZoom) {
          setData(null);
          return;
        }

        const b = map.getBounds();
        const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
        const qs = new URLSearchParams({ bbox });

        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        try {
          const res = await fetch(`/api/councils?${qs.toString()}`, {
            cache: 'no-store',
            signal: ac.signal,
          });
          if (!res.ok) throw new Error(`councils ${res.status}`);
          const fc = (await res.json()) as FeatureCollection;

          const count = Array.isArray(fc?.features) ? fc.features.length : 0;
          console.log('[council] features=', count);
          setData(count ? fc : null);
          setSeq((s) => s + 1);
        } catch (e: any) {
          if (e?.name !== 'AbortError') {
            console.error('Council fetch failed:', e);
            setData(null);
          }
        } finally {
          if (abortRef.current === ac) abortRef.current = null;
        }
      }, 350),
    [enabled, map, minZoom]
  );

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, minZoom]);

  useMapEvents({
    moveend: refetch,
    zoomend: refetch,
  });

  // tiles (~200) < council (300) < markers (400)
  return (
    <>
      <Pane name="council-pane" style={{ zIndex: 300 }} />
      {enabled && data ? (
        <GeoJSON
          key={`council-${seq}-${data.features.length}`}
          pane="council-pane"
          data={data as any}
          style={() => ({
            color: '#1b8e5a',
            weight: 1.2,
            opacity: 0.9,
            fillColor: '#1b8e5a',
            fillOpacity: 0.08,
          })}
        />
      ) : null}
    </>
  );
}
