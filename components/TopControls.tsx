'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Map as LeafletMap } from 'leaflet';
import classNames from 'classnames';

export type CouncilOption = { label: string; value: string };

type Props = {
  mapRef: MutableRefObject<LeafletMap | null>;
  council: CouncilOption | null;
  onCouncilChange: (c: CouncilOption | null) => void;
};

export default function TopControls({ mapRef, council, onCouncilChange }: Props) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // Measure the bar and publish CSS variables so other components can avoid it.
  useLayoutEffect(() => {
    const updateVars = () => {
      const gap = 12; // px
      const h = barRef.current?.getBoundingClientRect().height ?? 64;
      document.documentElement.style.setProperty('--controls-h', `${Math.ceil(h)}px`);
      document.documentElement.style.setProperty('--controls-gap', `${gap}px`);
    };
    updateVars();
    const ro = new ResizeObserver(updateVars);
    if (barRef.current) ro.observe(barRef.current);
    setMounted(true);
    return () => ro.disconnect();
  }, []);

  // (Your existing council filter / search controls UI can stay as-is)
  return (
    <div
      ref={barRef}
      className={classNames(
        'pointer-events-auto absolute left-1/2 -translate-x-1/2',
        'top-3 z-[1200]', // higher than any Leaflet pane
        'w-[min(1100px,calc(100vw-1.5rem))]'
      )}
      role="region"
      aria-label="Map controls"
    >
      <div className="rounded-2xl bg-white/90 backdrop-blur shadow-lg border border-black/5">
        {/* === Replace the contents below with your existing controls === */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          {/* heatmap/markers/council toggles, sliders, etc. */}
          <span className="text-sm font-medium opacity-70">EV Finder Controls</span>
          {/* Example council clear chip (optional): */}
          {council && (
            <button
              onClick={() => onCouncilChange(null)}
              className="ml-auto text-xs rounded-full px-3 py-1 bg-gray-100 hover:bg-gray-200"
            >
              Clear council: {council.label}
            </button>
          )}
        </div>
        {/* === End controls content === */}
      </div>

      {/* Spacer element below the controls so the map content underneath isn’t clickable through edges */}
      {mounted && <div aria-hidden className="h-2" />}
    </div>
  );
}
