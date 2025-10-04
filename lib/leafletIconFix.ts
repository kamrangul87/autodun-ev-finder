'use client';
import L from 'leaflet';
let patched = false;
export function ensureLeafletIconFix() {
  if (patched) return; patched = true;
  (L.Icon.Default as any).mergeOptions({
    iconRetinaUrl: '/leaflet/marker-icon-2x.png',
    iconUrl: '/leaflet/marker-icon.png',
    shadowUrl: '/leaflet/marker-shadow.png',
  });
}
