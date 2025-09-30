'use client';

import React, { useMemo } from 'react';
import { GeoJSON, Pane } from 'react-leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Layer } from 'leaflet';

type Props = {
  enabled?: boolean;
  /** Name of the currently-selected council (for styling). */
  selectedName?: string | null;
  /** Called when user clicks a council polygon (or clicks empty map in parent to clear). */
  onPick?: (name: string, feature: Feature<Geometry, any>) => void;
};

function getName(f: Feature<Geometry, any>): string | null {
  const p = (f?.properties ?? {}) as Record<string, any>;
  return (
    p?.name ||
    p?.NAME ||
    p?.NAME_SHORT ||
    p?.borough ||
    p?.lad15nm ||
    p?.lad17nm ||
    null
  );
}

export default function CouncilLayer({ enabled = true, selectedName, onPick }: Props) {
  // Fetch from our API using map bbox; the ClientMap fetches /api/councils via bbox.
  // To keep this component self-contained we let the parent page hit /api/councils
  // indirectly by giving it a src; but for now we load a static endpoint that reads bbox
  // from the window’s current map. Parent ensures bbox param is applied by server route.
  // Here we just render whatever the parent already requested; simplest is the parent
  // passing the data. To avoid churn, we’ll fetch here with no-cache and let the server clip.

  // NOTE: If you already pass the data from parent, you can delete this fetch and
  // expose {data} as a prop instead.

  const [data, setData] = React.useState<FeatureCollection | null>(null);

  React.useEffect(() => {
    let abort = false;
    async function load() {
      try {
        // Let the API compute bbox clipping from the map via query string.
        // We just try once on mount; ClientMap remounts CouncilLayer when bounds change.
        const u = new URL('/api/councils', window.location.origin);
        // pass bbox if present in URL (optional)
        const spIn = new URLSearchParams(window.location.search);
        const bbox = spIn.get('bbox');
        if (bbox) u.searchParams.set('bbox', bbox);
        const res = await fetch(u.toString(), { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as FeatureCollection;
        if (!abort) setData(json);
      } catch {
        // ignore
      }
    }
    if (enabled) load();
    return () => {
      abort = true;
    };
  }, [enabled]);

  const style = useMemo(
    () => () => ({
      color: '#0a6c47',
      weight: 2,
      opacity: 0.9,
      fillColor: '#0a6c47',
      // Slightly stronger fill for the selected polygon
      fillOpacity: 0.08,
    }),
    []
  );

  if (!enabled || !data?.features?.length) return null;

  return (
    <>
      <Pane name="council-pane" style={{ zIndex: 350 }} />
      <GeoJSON
        key={`councils-${data.features.length}-${selectedName ?? 'none'}`}
        pane="council-pane"
        data={data as any}
        style={(feat) => {
          const base = style();
          const name = feat ? getName(feat as any) : null;
          if (selectedName && name && name === selectedName) {
            return { ...base, weight: 3, fillOpacity: 0.18 };
          }
          return base;
        }}
        onEachFeature={(feature: Feature<Geometry, any>, layer: Layer) => {
          const name = getName(feature) ?? 'Council';
          // Simple hover highlight
          // @ts-ignore leaflet layer typing
          layer.on('mouseover', () => {
            // @ts-ignore
            layer.setStyle?.({ weight: 3, fillOpacity: 0.18 })?.bringToFront?.();
          });
          // @ts-ignore
          layer.on('mouseout', () => {
            // @ts-ignore
            layer.setStyle?.(style());
          });
          // Click to select
          // @ts-ignore
          layer.on('click', () => onPick?.(name, feature));
          // Small tooltip so users see the borough name while hovering
          // @ts-ignore
          layer.bindTooltip(name, { sticky: true, direction: 'top', opacity: 0.9 });
        }}
      />
    </>
  );
}
