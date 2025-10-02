'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export default function SearchControl() {
  const map = useMap();

  useEffect(() => {
    let container: HTMLDivElement | null = null;

    // Create a Leaflet control in the top-right
    const control = L.control({ position: 'topright' });
    control.onAdd = () => {
      container = L.DomUtil.create('div', 'leaflet-control');
      container.style.background = 'white';
      container.style.padding = '6px';
      container.style.borderRadius = '8px';
      container.style.boxShadow = '0 1px 3px rgba(0,0,0,.2)';

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Search address or place...';
      input.style.width = '260px';
      input.style.padding = '6px 8px';
      input.style.border = '1px solid #e5e7eb';
      input.style.borderRadius = '6px';
      input.style.outline = 'none';
      input.autocomplete = 'off';

      const list = document.createElement('div');
      list.style.marginTop = '6px';
      list.style.maxHeight = '200px';
      list.style.overflowY = 'auto';

      container.appendChild(input);
      container.appendChild(list);

      // Prevent map gestures while interacting with the control
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      let controller: AbortController | null = null;

      input.addEventListener('input', async () => {
        const q = input.value.trim();
        list.innerHTML = '';
        if (!q) return;

        try {
          controller?.abort();
          controller = new AbortController();
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
              q
            )}&limit=5`,
            { signal: controller.signal, headers: { 'Accept-Language': 'en' } }
          );
          if (!res.ok) return;

          const data = (await res.json()) as Array<{
            lat: string;
            lon: string;
            display_name: string;
          }>;

          list.innerHTML = '';
          data.forEach((item) => {
            const row = document.createElement('div');
            row.textContent = item.display_name;
            row.style.padding = '6px 8px';
            row.style.cursor = 'pointer';
            row.style.fontSize = '12px';
            row.addEventListener('mouseenter', () => (row.style.background = '#f3f4f6'));
            row.addEventListener('mouseleave', () => (row.style.background = 'transparent'));
            row.addEventListener('click', () => {
              const lat = parseFloat(item.lat);
              const lon = parseFloat(item.lon);
              if (Number.isFinite(lat) && Number.isFinite(lon)) {
                map.setView([lat, lon], 14);
                list.innerHTML = '';
              }
            });
            list.appendChild(row);
          });
        } catch {
          /* ignore */
        }
      });

      return container;
    };

    control.addTo(map);
    return () => {
      control.remove();
      container = null;
    };
  }, [map]);

  return null;
}
