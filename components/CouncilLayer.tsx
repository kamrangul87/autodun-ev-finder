'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import { GeoJSON, Pane, useMap, useMapEvents } from 'react-leaflet';

function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

type Props = { enabled: boolean; minZoom?: number };

export default function CouncilLayer({ enabled, minZoom = 9 }: Props) {
  const map = useMap();
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [seq, setSeq] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useMemo(
    () =>
      debounce(async () => {
        if (!enabled || !map) return;
        if (map.getZoom() < minZoom) { setData(null); return; }

        const b = map.getBounds();
        const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
        const qs = new URLSearchParams({ bbox });

        abortRef.current?.abort();
        const ac = new AbortController(); abortRef.current = ac;

        try {
          const res = await fetch(`/api/councils?${qs.toString()}`, { cache: 'no-store', signal: ac.signal });
          if (!res.ok) throw new Error(String(res.status));
          const fc = (await res.json()) as FeatureCollection;
          setData(fc?.features?.length ? fc : null);
          setSeq(s => s + 1);
        } catch (e: any) {
          if (e?.name !== 'AbortError') setData(null);
        } finally {
          if (abortRef.current === ac) abortRef.current = null;
        }
      }, 350),
    [enabled, map, minZoom]
  );

  useEffect(() => { refetch(); /* eslint-disable-next-line */ }, [enabled, minZoom]);
  useMapEvents({ moveend: refetch, zoomend: refetch });

  const getName = (f: Feature) =>
    (f.properties as any)?.name ??
    (f.properties as any)?.NAME ??
    (f.properties as any)?.lad23nm ??
    (f.properties as any)?.lad22nm ??
    (f.properties as any)?.borough ??
    '';

  const style = () => ({
    color: '#0b7d5c',
    weight: 2,
    opacity: 1,
    fillColor: '#0b7d5c',
    fillOpacity: 0.18,
  });

  return (
    <>
      <Pane name="council-pane" style={{ zIndex: 300 }} />
      {enabled && data ? (
        <GeoJSON
          key={`council-${seq}-${data.features.length}`}
          pane="council-pane"
          data={data as any}
          style={style}
          onEachFeature={(feature, layer) => {
            const name = getName(feature);
            if (name) {
              layer.bindTooltip(name, {
                sticky: true,
                direction: 'center',
                opacity: 0.9,
                className: 'council-label',
              });
            }
            layer.on('mouseover', () => layer.setStyle({ weight: 3, fillOpacity: 0.28 }).bringToFront());
            layer.on('mouseout',  () => layer.setStyle(style() as any));
          }}
        />
      ) : null}
      <style jsx global>{`
        .leaflet-tooltip.council-label {
          padding: 2px 6px;
          background: rgba(255,255,255,.85);
          border: 1px solid rgba(0,0,0,.15);
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
        }
      `}</style>
    </>
  );
}
