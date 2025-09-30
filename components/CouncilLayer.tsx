'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { GeoJSON, Pane, useMap, useMapEvents } from 'react-leaflet';

// tiny debounce helper
function debounce<T extends (...a: any[]) => void>(fn: T, wait = 300) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

type Props = {
  enabled: boolean;
  /** polygons are hidden below this zoom */
  minZoom?: number;
  /** called when user clicks a polygon */
  onSelect?: (f: Feature) => void;
  /** name (or id) of the currently selected polygon for highlight */
  selectedKey?: string | null;
  /** which feature property to use as the id/key (default "name") */
  keyProp?: string;
};

export default function CouncilLayer({
  enabled,
  minZoom = 10,
  onSelect,
  selectedKey,
  keyProp = 'name',
}: Props) {
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
      }, 300),
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

  const style = (feature?: Feature) => {
    const k = String(feature?.properties?.[keyProp] ?? '');
    const selected = selectedKey && k === selectedKey;
    return {
      color: selected ? '#0a7' : '#1d6b66',
      weight: selected ? 2.5 : 1.5,
      opacity: selected ? 1 : 0.9,
      fillColor: selected ? '#0a7' : '#1d6b66',
      fillOpacity: selected ? 0.18 : 0.10,
    };
  };

  return (
    <>
      {/* tiles (~200) < council (300) < markers (400) */}
      <Pane name="council-pane" style={{ zIndex: 300 }} />
      {enabled && data ? (
        <GeoJSON
          key={`council-${seq}-${data.features.length}-${selectedKey ?? 'none'}`}
          pane="council-pane"
          data={data as any}
          style={style}
          onEachFeature={(feature: Feature<Geometry, any>, layer: any) => {
            const name = feature?.properties?.[keyProp];
            if (name) {
              try {
                layer.bindTooltip(String(name), { direction: 'auto' });
              } catch {}
            }

            // hover highlight
            layer.on('mouseover', () => {
              layer.setStyle({ weight: 2.5, fillOpacity: 0.18 }).bringToFront();
            });
            layer.on('mouseout', () => {
              layer.setStyle(style(feature));
            });

            // click to select
            layer.on('click', () => {
              onSelect?.(feature);
            });
          }}
        />
      ) : null}
    </>
  );
}
