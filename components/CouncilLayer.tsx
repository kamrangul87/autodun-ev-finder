'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { GeoJSON, Pane, useMap, useMapEvents } from 'react-leaflet';

// debounce helper
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

type Props = {
  enabled: boolean;
  /** Hide below this zoom (lowered so you can see polygons sooner) */
  minZoom?: number;
};

export default function CouncilLayer({ enabled, minZoom = 6 }: Props) {
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

        // cancel any in-flight request
        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        try {
          const res = await fetch(`/api/councils?bbox=${encodeURIComponent(bbox)}`, {
            cache: 'no-store',
            signal: ac.signal,
          });
          if (!res.ok) throw new Error(`councils ${res.status}`);
          const fc = (await res.json()) as FeatureCollection;

          const count = Array.isArray(fc?.features) ? fc.features.length : 0;
          console.log('[council] bbox=', bbox, 'zoom=', z, 'features=', count);

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

  // initial + when toggle/zoom limit changes
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, minZoom]);

  // re-fetch after pan/zoom
  useMapEvents({
    moveend: refetch,
    zoomend: refetch,
  });

  // dedicated pane so polygons sit under markers (tile≈200 < council=300 < markers=400)
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
            fillOpacity: 0.12,
          })}
        />
      ) : null}
    </>
  );
}
