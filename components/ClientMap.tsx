'use client';

import React, { useEffect, useRef, useState } from 'react';

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

  // --- New refs for programmatic move/auto-fit/guarded fetch ---
  const isProgrammaticMove = useRef(false);
  const hasDoneInitialFetch = useRef(false);
  const userInteracted = useRef(false);
  const fetchTimer = useRef<number | undefined>(undefined);

  const [stations, setStations] = useState<Station[]>([]);
  const [councils, setCouncils] = useState<CouncilGeoJSON | null>(null);
  const [ready, setReady] = useState(false);

  // Fetch data with safe fallbacks
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
          // optional
        }
      })();
    }

    return () => {
      aborted = true;
    };
  }, [showCouncil, onStationsCount]);

  // --- Track real user interaction ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mark = () => { userInteracted.current = true; };
    map.on('dragstart', mark);
    map.on('zoomstart', mark);
    map.on('movestart', mark);
    return () => {
      map.off('dragstart', mark);
      map.off('zoomstart', mark);
      map.off('movestart', mark);
    };
  }, [ready]);

  // --- Do ONE initial fetch after map is ready, NO fitBounds ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasDoneInitialFetch.current) return;
    hasDoneInitialFetch.current = true;
    const b = map.getBounds();
    const bbox = `(${b.getSouth()},${b.getWest()}),(${b.getNorth()},${b.getEast()})`;
    fetch(`/api/stations?bbox=${encodeURIComponent(bbox)}&max=200`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        setStations(data.items ?? []);
        // Optionally set source if you use it
        // setSource(data.source ?? '');
      })
      .catch(console.error);
  }, [ready]);

  // --- Debounced fetch on moveend, ONLY after user interaction and not programmatic ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const scheduleFetch = () => {
      if (isProgrammaticMove.current) return;
      if (!userInteracted.current) return;
      if (fetchTimer.current) window.clearTimeout(fetchTimer.current);
      fetchTimer.current = window.setTimeout(() => {
        const b = map.getBounds();
        const bbox = `(${b.getSouth()},${b.getWest()}),(${b.getNorth()},${b.getEast()})`;
        fetch(`/api/stations?bbox=${encodeURIComponent(bbox)}&max=200`, { cache: 'no-store' })
          .then(r => r.json())
          .then(data => {
            setStations(data.items ?? []);
            // Optionally set source if you use it
            // setSource(data.source ?? '');
          })
          .catch(console.error);
      }, 450);
    };
    map.on('moveend', scheduleFetch);
    return () => {
      map.off('moveend', scheduleFetch);
      if (fetchTimer.current) window.clearTimeout(fetchTimer.current);
    };
  }, [ready]);

  // Initialize Leaflet map purely on the client.
  useEffect(() => {
    if (mapRef.current) return;

    // ✅ capture element BEFORE async boundary so TS knows it's not null
    const container = mapDivRef.current;
    if (!container) return;

    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet.heat');

      const map = L.map(container as HTMLElement, {
        center: initialCenter,
        zoom: initialZoom,
        zoomControl: true,
      });
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      }).addTo(map);

      markersLayerRef.current = L.layerGroup();
      heatLayerRef.current = null;
      councilLayerRef.current = L.layerGroup();

      setReady(true);
    })();

    return () => {
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

  // --- REMOVE any automatic fitBounds/centering effects on stations change ---

  // --- Zoom to data button handler ---
  function handleZoomToData() {
    const map = mapRef.current;
    if (!map || !stations?.length) return;
    (async () => {
      const L = (await import('leaflet')).default;
      const bounds = L.latLngBounds(stations.map(s => [s.lat, s.lng]));
      isProgrammaticMove.current = true;
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12, animate: false });
      map.once('moveend', () => { isProgrammaticMove.current = false; });
    })();
  }

  // --- Search action handler (recenters map, resets userInteracted) ---
  function handleSearch(lat: number, lng: number) {
    const map = mapRef.current;
    userInteracted.current = false;
    isProgrammaticMove.current = true;
    map.setView([lat, lng], 12, { animate: false });
    map.once('moveend', () => { isProgrammaticMove.current = false; });
  }

  // Render / update heatmap
  useEffect(() => {
    if (!ready || !mapRef.current) return;

    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet.heat');

      if (heatLayerRef.current && mapRef.current.hasLayer(heatLayerRef.current)) {
        mapRef.current.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }

      if (showHeatmap && stations.length) {
        const points = stations.map((s) => [
          s.lat,
          s.lng,
          Math.max(0.2, (heatOptions?.intensity ?? 0.6)),
        ]) as any[];
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

  // Render / update council polygons
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

  // --- Ensure the map container height is fixed ---
  return (
    <div className="w-full h-[calc(100vh-160px)]">
      <div ref={mapDivRef} className="w-full h-full" />
    </div>
  );
}
