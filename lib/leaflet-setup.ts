// Ensure default Leaflet marker icons load in Next.js
import L from 'leaflet';
import marker2x from 'leaflet/dist/images/marker-icon-2x.png';
import marker from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';
// @ts-ignore
delete (L.Icon.Default as any).prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: marker2x.src || marker2x,
  iconUrl: marker.src || marker,
  shadowUrl: shadow.src || shadow,
});
