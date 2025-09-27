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
  minZoom?: number;
};

export default function CouncilLayer({ enabled, minZoom = 8 }: Props) {
  const map = useMap();
  const [data, setData] = useState<FeatureCollection | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [seq, setSeq] = useState(0);

  const refetch = useMemo(
    () =>
      debounce(async () => {
        if (!enabled || !map) return;
        if (map.getZoom() < minZoom) {
          setData(null);
          return;
        }

        const b = map.getBounds();
        const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;

        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        try {
          const res = await fetch(`/api/councils?bbox=${encodeURIComponent(bbox)}`, {
            signal: ac.signal,
            cache: 'no-store',
          });
          if (!res.ok) throw new Error(`council fetch ${res.status}`);
          const fc = (await res.json()) as FeatureCollection;
          setData(fc?.features?.length ? fc : null);
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

  // Always create pane so z-order stays stable
  return (
    <>
      <Pane name="council-pane" style={{ zIndex: 300 }} />
      {enabled && data ? (
        <GeoJSON
          key={`council-${seq}-${data.features.length}`}
          pane="council-pane"
          data={data as any}
          style={() => ({
            color: '#2b7',
            weight: 1.5,
            opacity: 0.9,
            fillColor: '#2b7',
            fillOpacity: 0.1,
          })}
        />
      ) : null}
    </>
  );
}
