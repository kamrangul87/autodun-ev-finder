'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { GeoJSON, Pane, useMap, useMapEvents } from 'react-leaflet';

// Small debounce helper
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 350) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

type Props = {
  /** Toggle from your UI */
  enabled: boolean;
  /** Hide layer below this zoom (default 6 so it’s easier to see) */
  minZoom?: number;
};

export default function CouncilLayer({ enabled, minZoom = 6 }: Props) {
  const map = useMap();
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [seq, setSeq] = useState(0); // forces GeoJSON re-render when data changes
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
