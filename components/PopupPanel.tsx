'use client';

import React, { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import type { Station } from '@/types';

type Props = {
  station: Station | null;
  onClose: () => void;
};

export default function PopupPanel({ station, onClose }: Props) {
  // If nothing selected, render nothing to keep DOM clean
  if (!station) return null;

  // Compute Google Maps link lazily
  const gmapsHref = useMemo(() => {
    const lat = station?.lat ?? station?.latitude;
    const lng = station?.lng ?? station?.longitude;
    return `https://maps.google.com/?q=${lat},${lng}`;
  }, [station]);

  return (
    <>
      {/* Backdrop only on small screens to emulate a sheet */}
      <div
        className="fixed inset-0 z-[1199] bg-black/20 md:hidden"
        onClick={onClose}
        aria-hidden
      />

      <aside
        className="
          fixed z-[1201]
          md:right-4 md:top-[calc(var(--controls-h,64px)+var(--controls-gap,12px))]
          md:max-h-[calc(100vh-var(--controls-h,64px)-var(--controls-gap,12px)-2rem)]
          md:w-[380px]
          md:rounded-2xl
          md:shadow-2xl
          md:border md:border-black/5
          md:bg-white/95 md:backdrop-blur

          left-0 right-0 bottom-0
          md:left-auto
          bg-white
        "
        role="dialog"
        aria-label="Station details"
      >
        {/* Mobile grabber */}
        <div className="md:hidden mx-auto mt-2 h-1.5 w-12 rounded-full bg-gray-300" />

        <div className="relative px-4 pt-3 pb-4 md:p-4">
          {/* Close */}
          <button
            aria-label="Close"
            onClick={onClose}
            className="
              absolute right-3 top-3 inline-flex items-center justify-center
              h-8 w-8 rounded-full transition shadow-sm
              bg-white hover:bg-gray-100 border border-black/5
            "
          >
            <X size={16} />
          </button>

          {/* Title */}
          <h3 className="pr-10 text-base md:text-lg font-semibold">
            {station.name || 'EV Charging'}
          </h3>

          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-500">Address</dt>
              <dd className="flex-1">{station.address ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-500">Postcode</dt>
              <dd className="flex-1">{station.postcode ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-500">Source</dt>
              <dd className="flex-1">{station.source ?? 'osm'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-500">Connectors</dt>
              <dd className="flex-1">{station.connectors ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-500">Reports</dt>
              <dd className="flex-1">{station.reports ?? 0}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-500">Downtime (mins)</dt>
              <dd className="flex-1">{station.downtimeMins ?? 0}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-gray-500">Coordinates</dt>
              <dd className="flex-1">
                {(station.lat ?? station.latitude)?.toFixed(6)}, {(station.lng ?? station.longitude)?.toFixed(6)}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <a
              href={gmapsHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-black/10 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Open in Google Maps
            </a>
          </div>
        </div>

        {/* Scroll containment on desktop */}
        <div className="hidden md:block md:absolute md:inset-0 md:overflow-auto md:rounded-2xl" aria-hidden />
      </aside>
    </>
  );
}
