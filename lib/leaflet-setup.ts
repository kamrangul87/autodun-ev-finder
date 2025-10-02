// lib/leaflet-setup.ts
'use client';

import L from 'leaflet';
import marker2x from 'leaflet/dist/images/marker-icon-2x.png';
import marker from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';

export function fixLeafletIcons() {
  if (typeof window === 'undefined') return;
  // @ts-ignore – clear internal cache so mergeOptions takes effect
  delete (L.Icon.Default.prototype as any)._getIconUrl;

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: marker2x.src,
    iconUrl: marker.src,
    shadowUrl: shadow.src,
  });
}
