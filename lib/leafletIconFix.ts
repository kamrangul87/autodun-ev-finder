'use client';
import L from 'leaflet';
import icon2x from 'leaflet/dist/images/marker-icon-2x.png';
import icon from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';

let patched = false;
export function ensureLeafletIconFix() {
  if (patched) return;
  patched = true;
  const toUrl = (m: any) => (typeof m === 'string' ? m : (m?.src ?? m));
  (L.Icon.Default as any).mergeOptions({
    iconRetinaUrl: toUrl(icon2x),
    iconUrl: toUrl(icon),
    shadowUrl: toUrl(shadow),
  });
}
