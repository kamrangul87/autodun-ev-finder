'use client';

import { useState, useCallback, useRef } from 'react';
import { Map as LeafletMap } from 'leaflet';

const STORAGE_KEY = 'autodun.view.v1';
const DEFAULT_VIEW = {
  center: [51.5074, -0.1278] as [number, number],
  zoom: 11,
};

interface MapView {
  center: [number, number];
  zoom: number;
}

export function useMapViewState() {
  const [view, setView] = useState<MapView>(() => {
    if (typeof window === 'undefined') return DEFAULT_VIEW;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_VIEW;
    } catch {
      return DEFAULT_VIEW;
    }
  });

  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  const saveView = useCallback((newView: MapView) => {
    setView(newView);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newView));
      } catch (e) {
        console.warn('Failed to save view:', e);
      }
    }
  }, []);

  const saveOnMove = useCallback((map: LeafletMap) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      saveView({ center: [center.lat, center.lng], zoom });
    }, 250);
  }, [saveView]);

  return { view, saveView, saveOnMove };
}
