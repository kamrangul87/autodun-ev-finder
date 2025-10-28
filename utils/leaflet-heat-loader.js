export function ensureHeatLoaded() {
  if (typeof window === "undefined") return;
  try { require("leaflet.heat"); } catch (e) { /* already loaded or not needed */ }
}
