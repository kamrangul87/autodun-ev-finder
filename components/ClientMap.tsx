'use client';

// Client-only map. All Leaflet/Plugin imports happen INSIDE effects.
// No top-level "window"/Leaflet references.

import React, { useEffect, useMemo, useRef, useState } from 'react';

type LatLng = [number, number];

export type Props = {
  initialCenter?: LatLng;
  initialZoom?: number;
  showHeatmap?: boolean;
  showMarkers?: boolean;
  showCouncil?: boolean;
  heatOptions?: { intensity?: number; radius?: number; blur?: number };
  onStationsCount?: (n: number) => void;
};

type Station = {
  id?: string | number;
  name?: string;
  address?: string;
  postcode?: string;
  source?: string;
  connectors?: number;
  lat: number;
  lng: number;
};

type CouncilGeoJSON = {
  type: 'FeatureCollection';
  features: Array<any>;
};

export default function ClientMap({
  initialCenter = [51.509865, -0.118092],
  initialZoom = 7,
  showHeatmap = true,
  showMarkers = true,
  showCouncil = false,
  heatOptions,
  onStationsCount,
}: Props) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const heatLayerRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const councilLayerRef = useRef<any>(null);

  const [stations, setStations] = useState<Station[]>([]);
  const [councils, setCouncils] = useState<CouncilGeoJSON | null>(null);
  const [ready, setReady] = useState(false);

  // Fetch data with safe fallbacks so UI always renders.
  useEffect(() => {
    let aborted = false;

    (async () => {
      try {
        const res = await fetch('/api/stations', { cache: 'no-store' });
        if (!res.ok) throw new Error('stations fetch failed');
        const json = await res.json();
        const items: Station[] = (json?.items ?? [])
          .filter((s: any) => typeof s?.lat === 'number' && typeof s?.lng === 'number');
        if (!aborted) {
          setStations(items);
          onStationsCount?.(items.length);
        }
      } catch {
        if (!aborted) {
          // Minimal fallback so the map shows something
          const fallback: Station[] = [
            { id: 'fallback-1', lat: 51.509865, lng: -0.118092, name: 'Fallback London' },
          ];
          setStations(fallback);
          onStationsCount?.(fallback.length);
        }
      }
    })();

    if (showCouncil) {
      (async () => {
        try {
          const res = await fetch('/api/councils', { cache: 'no-store' });
          if (res.ok) {
            const gj = await res.json();
            if (!aborted) setCouncils(gj);
          }
        } catch {
          // ignore; council is optional
        }
      })();
    }

    return () => {
      aborted = true;
    };
  }, [showCouncil, onStationsCount]);

  // Initialize Leaflet map purely on the client.
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    (async () => {
      // Import Leaflet ONLY in the browser.
      const L = (await import('leaflet')).default;

      // (Optional) CSS is already global; if not, ensure it’s imported in a client layout.
      // Import leaflet.heat plugin (side-effect module) after Leaflet is present.
      await import('leaflet.heat');

      // Create map
      const map = L.map(mapDivRef.current, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: true,
      });
      mapRef.current = map;

      // Base layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      }).addTo(map);

      // Prepare layers but don't add until data & flags say so
      markersLayerRef.current = L.layerGroup();
      heatLayerRef.current = null; // will create after stations ready
      councilLayerRef.current = L.layerGroup();

      setReady(true);
    })();

    return () => {
      // Clean up on unmount
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      heatLayerRef.current = null;
      markersLayerRef.current = null;
      councilLayerRef.current = null;
    };
  }, [initialCenter, initialZoom]);

  // Render / update markers
  useEffect(() => {
    if (!ready || !mapRef.current || !markersLayerRef.current) return;

    (async () => {
      const L = (await import('leaflet')).default;

      const group = markersLayerRef.current as any;
      group.clearLayers();

      if (showMarkers && stations.length) {
        stations.forEach((s) => {
          const marker = L.circleMarker([s.lat, s.lng], { radius: 4 });
          const popupHtml = `
            <div style="min-width:200px">
              <strong>${s.name ?? 'Charging Point'}</strong><br/>
              ${s.address ?? ''}<br/>
              ${s.postcode ?? ''}<br/>
              <button id="qb-${s.id}" style="margin-top:8px;padding:6px 10px;border:1px solid #ccc;border-radius:6px;cursor:pointer;">
                Quick Feedback
              </button>
            </div>
          `;
          marker.bindPopup(popupHtml);
          marker.on('popupopen', () => {
            const btn = document.getElementById(`qb-${s.id}`);
            if (btn) {
              btn.onclick = async () => {
                try {
                  await fetch('/api/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ stationId: s.id ?? null, action: 'quick' }),
                  });
                  marker.closePopup();
                } catch {
                  marker.closePopup();
                }
              };
            }
          });
          marker.addTo(group);
        });

        if (!mapRef.current.hasLayer(group)) {
          group.addTo(mapRef.current);
        }
      } else {
        if (mapRef.current.hasLayer(group)) {
          mapRef.current.removeLayer(group);
        }
      }
    })();
  }, [ready, showMarkers, stations]);

  // Render / update heatmap
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet.heat');

      // Remove previous heat if any
      if (heatLayerRef.current && mapRef.current.hasLayer(heatLayerRef.current)) {
        mapRef.current.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }

      if (showHeatmap && stations.length) {
        const points = stations.map((s) => [s.lat, s.lng, Math.max(0.2, (heatOptions?.intensity ?? 0.6))]) as any[];
        const layer = (L as any).heatLayer(points, {
          radius: heatOptions?.radius ?? 18,
          blur: heatOptions?.blur ?? 15,
          maxZoom: 17,
        });
        heatLayerRef.current = layer;
        layer.addTo(mapRef.current);
      }
    })();
  }, [ready, showHeatmap, stations, heatOptions?.intensity, heatOptions?.radius, heatOptions?.blur]);

  // Render / update council polygons (optional)
  useEffect(() => {
    if (!ready || !mapRef.current || !councilLayerRef.current) return;

    (async () => {
      const L = (await import('leaflet')).default;
      const group = councilLayerRef.current as any;
      group.clearLayers();

      if (showCouncil && councils?.features?.length) {
        const layer = L.geoJSON(councils as any, {
          style: () => ({
            color: '#228be6',
            weight: 1,
            fillOpacity: 0.05,
          }),
        });
        layer.addTo(group);
        if (!mapRef.current.hasLayer(group)) mapRef.current.addLayer(group);
      } else {
        if (mapRef.current.hasLayer(group)) mapRef.current.removeLayer(group);
      }
    })();
  }, [ready, showCouncil, councils]);

  return (
    <div className="w-full h-full">
      <div ref={mapDivRef} className="w-full h-full" />
    </div>
  );
}
