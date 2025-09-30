'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { MapContainer, TileLayer, Pane, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';

import ClusterLayer from '@/components/ClusterLayer';
import PopupPanel from '@/components/PopupPanel';

/** Minimal local types (no aliases) */
type Station = {
  id?: string | number;
  name?: string;
  address?: string;
  postcode?: string;
  source?: string;
  connectors?: number | string;
  reports?: number;
  downtimeMins?: number;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  councilCode?: string;
};

type Props = {
  /** Pass your stations from the page. If empty, you’ll just see the base map. */
  stations?: Station[];
  initialCenter?: [number, number];
  initialZoom?: number;
};

/** Create predictable Leaflet panes (z-index sanity) */
function EnsurePanes() {
  const map = useMap();
  useEffect(() => {
    const defs: Array<[string, number, ('auto' | 'none')?]> = [
      ['base', 100, 'auto'],     // tiles
      ['clusters', 300, 'auto'], // markers/clusters
      ['popups', 400, 'auto'],   // (Leaflet default)
      ['ui', 1000, 'none'],      // reserved
    ];
    defs.forEach(([name, z, pe]) => {
      const pane = map.getPane(name) ?? map.createPane(name);
      pane.style.zIndex = String(z);
      pane.style.pointerEvents = pe ?? 'auto';
    });
  }, [map]);
  return null;
}

export default function ClientMap({
  stations = [],
  initialCenter = [51.5072, -0.1276],
  initialZoom = 9,
}: Props) {
  const mapRef = useRef<LeafletMap | null>(null);

  // Selected marker -> opens the right/bottom popup panel
  const [activeStation, setActiveStation] = useState<Station | null>(null);
  const handleMarkerClick = (s: Station) => setActiveStation(s);
  const handleClosePanel = () => setActiveStation(null);

  // Normalize lat/lng so ClusterLayer never crashes
  const safeStations = useMemo(() => {
    return (stations ?? []).filter((s) => {
      const lat = s.lat ?? s.latitude;
      const lng = s.lng ?? s.longitude;
      return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);
    });
  }, [stations]);

  return (
    <div className="map-root">
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        ref={(ref) => { if (ref) mapRef.current = ref; }}
        className="leaflet-map"
        preferCanvas
        style={{ height: 'calc(100vh - 120px)' }}
      >
        <EnsurePanes />

        {/* Base tiles */}
        <Pane name="base">
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </Pane>

        {/* Markers (no Leaflet <Popup>; clicking opens our panel) */}
        <Pane name="clusters">
          <ClusterLayer
            stations={safeStations}
            onMarkerClick={handleMarkerClick}
            visible
          />
        </Pane>
      </MapContainer>

      {/* Right-docked detail panel / bottom sheet */}
      <PopupPanel station={activeStation} onClose={handleClosePanel} />
    </div>
  );
}
