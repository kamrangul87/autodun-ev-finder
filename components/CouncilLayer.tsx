'use client';

import React, { useEffect, useState } from 'react';
import { GeoJSON } from 'react-leaflet';

type Props = {
  /** Public path, e.g. `/data/london_boroughs.geojson` */
  url: string;
  /** Line color (default teal) */
  color?: string;
};

export default function CouncilLayer({ url, color = '#14b8a6' }: Props) {
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!cancel && res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch {
        // Ignore (no overlay if fetch fails)
      }
    })();
    return () => {
      cancel = true;
    };
  }, [url]);

  if (!data) return null;

  return (
    <GeoJSON
      data={data}
      style={() => ({
        color,
        weight: 1.5,
        fillOpacity: 0,
      })}
    />
  );
}
