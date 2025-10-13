'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

export type Station = {
  id?: string | number;
  name?: string;
  address?: string;
  postcode?: string;
  connectors?: number;
  source?: string;
  lat: number;
  lng: number;
};

type Props = {
  isOpen: boolean;
  station: Station | null;
  onClose: () => void;
  className?: string;
};

export default function StationDrawer({ isOpen, station, onClose, className }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <aside
      aria-hidden={!isOpen}
      aria-live="polite"
      role="dialog"
      aria-modal="false"
      className={[
        'fixed top-4 right-4 w-[360px] max-w-[92vw]',
        'rounded-2xl shadow-xl',
        'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800',
        'transition-transform duration-200 ease-out',
        'z-[1100]',
        isOpen ? 'translate-x-0 opacity-100' : 'translate-x-[420px] opacity-0 pointer-events-none',
        className || '',
      ].join(' ')}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <h3 className="text-base font-semibold truncate">{station?.name || 'Charging station'}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close station details"
          className="inline-flex items-center justify-center rounded-full p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="px-4 py-3 space-y-3 text-sm">
        {station ? (
          <>
            <div className="grid grid-cols-3 gap-y-2">
              <span className="text-neutral-500">Postcode</span>
              <span className="col-span-2 font-medium">{station.postcode || '—'}</span>

              <span className="text-neutral-500">Address</span>
              <span className="col-span-2">{station.address || '—'}</span>

              <span className="text-neutral-500">Connectors</span>
              <span className="col-span-2">{station.connectors ?? '—'}</span>

              <span className="text-neutral-500">Source</span>
              <span className="col-span-2">{station.source || '—'}</span>
            </div>

            <div className="pt-1">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Get directions
              </a>
            </div>

            <form method="POST" action="/api/feedback" className="flex flex-col gap-2">
              <input type="hidden" name="stationId" value={`${station.id ?? ''}`} />
              <label className="text-neutral-600 text-sm" htmlFor="fb-note">Quick feedback</label>
              <textarea
                id="fb-note"
                name="note"
                className="rounded-xl border border-neutral-300 dark:border-neutral-700 p-2 min-h-[72px] bg-white dark:bg-neutral-900"
                placeholder="Type an issue or note about this station…"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-xl bg-black text-white px-3 py-2 text-sm font-medium hover:opacity-90"
              >
                Submit
              </button>
            </form>
          </>
        ) : (
          <p className="text-neutral-500">Select a station to see details.</p>
        )}
      </div>
    </aside>
  );
}
