'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

type Suggestion = {
  display_name: string;
  lat: string;
  lon: string;
};

function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export default function SearchControl() {
  const map = useMap();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useMemo(
    () =>
      debounce(async (value: string) => {
        if (!value) {
          setItems([]);
          return;
        }
        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
              value
            )}&limit=6`,
            { signal: ac.signal, headers: { 'Accept-Language': 'en' } }
          );
          if (!res.ok) throw new Error('search failed');
          const json = (await res.json()) as any[];
          setItems(
            (json ?? []).map((r) => ({
              display_name: r.display_name,
              lat: r.lat,
              lon: r.lon,
            }))
          );
        } catch {}
      }, 300),
    []
  );

  useEffect(() => {
    refetch(q);
  }, [q, refetch]);

  useEffect(() => {
    // render as a Leaflet control so it lives “inside” map chrome
    const Control = L.Control.extend({
      onAdd: () => {
        const c = L.DomUtil.create('div');
        // important: keep zIndex high to clear popups / clusters
        Object.assign(c.style, {
          zIndex: '1200',
          position: 'relative',
          width: '320px',
        });
        c.innerHTML = `
          <div style="
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(6px);
            border-radius: 12px;
            box-shadow: 0 6px 18px rgba(0,0,0,0.12);
            padding: 8px 10px;
            width: 100%;
          ">
            <input
              type="text"
              placeholder="Search address or place..."
              aria-label="Search"
              style="
                width:100%;
                border:1px solid #e5e7eb;
                border-radius:10px;
                padding:8px 10px;
                outline:none;
              "
              id="ev-search-input"
            />
            <ul id="ev-search-results" style="
              list-style:none;margin:6px 0 0 0;padding:0;
              max-height:220px;overflow:auto;display:none;
              border:1px solid #e5e7eb;border-radius:10px;background:#fff;
            "></ul>
          </div>
        `;
        const input = c.querySelector<HTMLInputElement>('#ev-search-input')!;
        const list = c.querySelector<HTMLUListElement>('#ev-search-results')!;

        // wiring (React state -> DOM)
        const sync = () => {
          input.value = q;
          if (open && items.length > 0) {
            list.style.display = 'block';
            list.innerHTML = items
              .map(
                (s, i) =>
                  `<li data-i="${i}" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid #f2f2f2;">${s.display_name}</li>`
              )
              .join('');
          } else {
            list.style.display = 'none';
            list.innerHTML = '';
          }
        };
        sync();

        // DOM -> React state
        input.addEventListener('input', (e: any) => {
          setQ(e.target.value);
          setOpen(true);
        });
        input.addEventListener('focus', () => setOpen(true));
        list.addEventListener('click', (e: any) => {
          const li = e.target.closest('li');
          if (!li) return;
          const idx = Number(li.dataset.i);
          const hit = items[idx];
          if (!hit) return;
          setOpen(false);
          setItems([]);
          setQ(hit.display_name);
          map.setView([Number(hit.lat), Number(hit.lon)], 14);
        });

        // prevent map drag when interacting
        L.DomEvent.disableClickPropagation(c);
        L.DomEvent.disableScrollPropagation(c);
        return c;
      },
      onRemove: () => void 0,
    });

    const ctl = new Control({ position: 'topleft' });
    map.addControl(ctl);
    return () => map.removeControl(ctl);
  }, [map, q, open, items]);

  return null;
}
