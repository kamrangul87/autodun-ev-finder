// lib/leaflet-server-stub.ts
// Server build should never execute Leaflet; provide a harmless stub.
const L: any = {};
export default L;

// Some libs import 'leaflet.heat' for side-effects; export a noop.
export const heatLayer = () => ({ addTo: () => {}, setLatLngs: () => {} });
