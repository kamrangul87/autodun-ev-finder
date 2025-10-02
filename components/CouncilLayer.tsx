'use client';

import React, { useEffect, useState } from 'react';
import { GeoJSON } from 'react-leaflet';
import type { FeatureCollection, Geometry } from 'geojson';

type Props = {
  url: string;
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  weight?: number;
};

export default function CouncilLayer({
  url,
  color = '#0ea5a5',
  fillColor = '#06b6d4',
  fillOpacity = 0.12,
  weight = 2,
}: Props) {
  const [data, setData] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((fc) => {
        if (!alive) return;
        if (!fc || fc.type !== 'FeatureCollection') return setData(null);
        const filtered = {
          ...fc,
          features: (fc.features ?? []).filter((f: any) => {
            const t = f?.geometry?.type as Geometry['type'] | undefined;
            return t === 'Polygon' || t === 'MultiPolygon';
          }),
        } as FeatureCollection;
        setData(filtered);
      })
      .catch(() => setData(null));
    return () => { alive = false; };
  }, [url]);

  if (!data) return null;

  return (
    <GeoJSON
      data={data as any}
      style={() => ({ color, weight, fillColor, fillOpacity })}
      onEachFeature={(feature, layer) => {
        const props: any = feature?.properties || {};
        const name = props.name || props.NAME || props.lad23nm || props.lad22nm || props.ladnm || 'Council area';
        try {
          layer.bindTooltip(name, { sticky: true, direction: 'auto', opacity: 0.9 });
        } catch {}
      }}
    />
  );
}
