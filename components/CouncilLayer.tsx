'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSON, Pane, useMap, useMapEvents } from 'react-leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type * as L from 'leaflet';

// ---------- small helpers ----------
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function getName(f: Feature<Geometry, any>): string | null {
  const p = (f.properties || {}) as Record<string, any>;
  return (
    p.name ??
    p.lad23nm ??
    p.lad20nm ??
    p.lad17nm ??
    p.borough ??
    p.LAD13NM ??
    p.LAD17NM ??
    p.LAD19NM ??
    p.NM_MNCP ??
    null
  );
}

// TS type guard: only path-like layers have setStyle / bringToFront
function isPath(layer: any): layer is L.Path {
  return !!layer && typeof layer.setStyle === 'function';
}

// ---------- props ----------
type Props = {
  enabled: boolean;
  /** Hide layer below this zoom level (default 9) */
  minZoom?: number;
  /** Show tooltips from this zoom level (default 12) */
  labelMinZoom?: number;
};

// Enable debug rectangles only if you explicitly set this env in the client build
const DEBUG = process.env.NEXT_PUBLIC_COUNCIL_DEBUG === '1';

// ---------- component ----------
export default function CouncilLayer({
  enabled,
  minZoom = 9,
  labelMinZoom = 12,
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
        if (DEBUG) qs.set('debug', '1');

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

  // map tiles (~200) < councils (300) < markers (400)
  const baseStyle = useMemo(
    () =>
      ({
        color: '#136f63',
        weight: 1.5,
        opacity: 0.9,
        dashArray: '4,3', // subtle dashed border; remove if you prefer solid
        fillColor: '#136f63',
        fillOpacity: 0.10,
      }) as L.PathOptions,
    []
  );

  const style = () => baseStyle;

  return (
    <>
      <Pane name="council-pane" style={{ zIndex: 300 }} />
      {enabled && data ? (
        <GeoJSON
          key={`council-${seq}-${data.features.length}`}
          pane="council-pane"
          data={data as any}
          style={style}
          onEachFeature={(feature: Feature<Geometry, any>, layer) => {
            // Bind a tooltip with the best-guess name
            const name = getName(feature);
            if (name && (layer as any).bindTooltip) {
              (layer as any).bindTooltip(name, {
                direction: 'center',
                className: 'council-label',
                permanent: false, // we'll toggle open/close by zoom
                opacity: 0.9,
              });
            }

            // Hover highlight for path-like layers
            if (isPath(layer)) {
              layer.on('mouseover', () => {
                layer.setStyle({ weight: 3, fillOpacity: 0.22 } as L.PathOptions);
                (layer as any).bringToFront?.();
              });
              layer.on('mouseout', () => {
                layer.setStyle(baseStyle);
              });

              // Show/hide label by zoom level
              const toggleLabel = () => {
                const show = map.getZoom() >= labelMinZoom;
                if (show) (layer as any).openTooltip?.();
                else (layer as any).closeTooltip?.();
              };
              toggleLabel();
              map.on('zoomend', toggleLabel);
            }
          }}
        />
      ) : null}
    </>
  );
}
