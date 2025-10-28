"use client";
import { useEffect } from "react";

/** Loads leaflet.heat on the client once. */
export function useLeafletHeat() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined" || cancelled) return;
      try { await import("leaflet.heat"); } catch {}
    })();
    return () => { cancelled = true; };
  }, []);
}
