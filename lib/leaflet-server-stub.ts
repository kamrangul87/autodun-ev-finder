// lib/leaflet-server-stub.js
// No-op Leaflet stub for server build to avoid touching `window`.
const L = {};
export default L;

// Provide a minimal shape some plugins expect.
export const heatLayer = () => ({
  addTo: () => {},
  setLatLngs: () => {},
});
