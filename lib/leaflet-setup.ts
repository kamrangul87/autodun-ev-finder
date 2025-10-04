import L from 'leaflet';
import marker2x from 'leaflet/dist/images/marker-icon-2x.png';
import marker from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';
// @ts-ignore
delete (L.Icon.Default as any).prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: (marker2x as any).src || (marker2x as any),
  iconUrl: (marker as any).src || (marker as any),
  shadowUrl: (shadow as any).src || (shadow as any),
});
