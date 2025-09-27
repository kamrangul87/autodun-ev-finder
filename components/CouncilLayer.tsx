'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { GeoJSON, Pane, useMap, useMapEvents } from 'react-leaflet';

// --- tiny debounce ---
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

type Props = {
  enabled: boolean;           // hook this to your “Council” checkbox
  minZoom?: number;           // optional: hide below this zoom
};

export default function CouncilLayer({ enabled, minZoom = 8 }: Props) {
  const map = useMap();
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [seq, setSeq] = useState(0); // forces GeoJSON re-render

  // Keep layer in sync with map moves (debounced)
  const refetch = useMemo(
    () =>
      debounce(async () => {
        if (!enabled) return;
        if (!map) return;

        const z = map.getZoom();
        if (z < minZoom) {
          setData(null);
          return;
        }

        const b = map.getBounds();
        const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;

        // cancel any stale request
        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        setLoading(true);
        try {
          const url = `/api/councils?bbox=${encodeURIComponent(bbox)}`;
          const res = await fetch(url, { signal: ac.signal, cache: 'no-store' });
          if (!res.ok) throw new Error(`Council fetch ${res.status}`);
          const fc = (await res.json()) as FeatureCollection;
          setData(fc?.features?.length ? fc : null);
          // bump key so layer refreshes if feature count changed
          setSeq((s) => s + 1);
        } catch (err) {
          // swallow aborts, clear data on real errors
          if ((err as any)?.name !== 'AbortError') {
            console.error('Council fetch failed:', err);
            setData(null);
          }
        } finally {
          if (abortRef.current === ac) abortRef.current = null;
          setLoading(false);
        }
      }, 350),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, map, minZoom]
  );

  // trigger on mount + when map moves/zooms
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, minZoom]);

  useMapEvents({
    moveend: refetch,
    zoomend: refetch,
  });

  if (!enabled || !data) return (
    <>
      {/* ensure pane exists even if currently hidden, so z-order is stable */}
      <Pane name="council-pane" style={{ zIndex: 300 }} />
      {null}
    </>
  );

  return (
    <>
      <Pane name="council-pane" style={{ zIndex: 300 }} />
      <GeoJSON
        key={`council-${seq}-${data.features.length}`}
        pane="council-pane"
        data={data as any}
        style={() => ({
          color: '#2b7',      // stroke
          weight: 1.5,
          opacity: 0.9,
          fillColor: '#2b7',  // light fill
          fillOpacity: 0.1,
        })}
      />
      {/* Optional tiny badge for yourself while testing:
      {loading && <div className="leaflet-top leaflet-right"><div className="leaflet-control">council…</div></div>}
      */}
    </>
  );
}
