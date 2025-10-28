export function ensureHeatLoaded() {
  if (typeof window === "undefined") return;
  try {
    // Require at runtime so it never breaks SSR or header order
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("leaflet.heat");
  } catch (e) {
    // silently ignore if already loaded / not installed
    // console.warn("leaflet.heat not loaded:", e);
  }
}
