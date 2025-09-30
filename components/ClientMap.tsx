'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Pane, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';

import TopControls, { CouncilOption } from '@/components/TopControls';
import PopupPanel from '@/components/PopupPanel';
import HeatmapWithScaling from '@/components/HeatmapWithScaling';
import ClusterLayer from '@/components/ClusterLayer';

/** Minimal station shape (kept local to avoid path aliases) */
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
  stations?: Station[];
  initialCenter?: [number, number];
  initialZoom?: number;
};

/** Create/normalize panes with predictable stacking */
function EnsurePanes() {
  const map = useMap();
  useEffect(() => {
    const defs: Array<[string, number, ('auto' | 'none')?]> = [
      ['base', 100, 'auto'],      // tiles
      ['heatmap', 200, 'auto'],   // heat layer
      ['clusters', 300, 'auto'],  // markers / clusters
      ['popups', 400, 'auto'],    // (Leaflet default popups if ever used)
      ['ui', 1000, 'none'],       // reserved for in-map UI
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
  initialCenter = [51.5072, -0.1276], // London
  initialZoom = 9,
}: Props) {
  const mapRef = useRef<LeafletMap | null>(null);

  // Right-docked/bottom-sheet panel state
  const [activeStation, setActiveStation] = useState<Station | null>(null);

  // Optional council filter
  const [council, setCouncil] = useState<CouncilOption | null>(null);

  // Apply council filtering locally
  const filteredStations = useMemo(() => {
    if (!council) return stations;
    return stations.filter((s) => s.councilCode === council.value);
  }, [stations, council]);

  const handleMarkerClick = (s: Station) => setActiveStation(s);
  const handleClosePanel = () => setActiveStation(null);

  return (
    <div className="map-root">
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        ref={(ref) => { if (ref) mapRef.current = ref; }}
        className="leaflet-map"
        preferCanvas
      >
        <EnsurePanes />

        {/* Base tiles */}
        <Pane name="base">
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </Pane>

        {/* Heatmap */}
        <Pane name="heatmap">
          <HeatmapWithScaling points={filteredStations} />
        </Pane>

        {/* Markers / clusters (no Leaflet <Popup>; click opens React panel) */}
        <Pane name="clusters">
          <ClusterLayer
            stations={filteredStations}
            onMarkerClick={handleMarkerClick}
          />
        </Pane>

        {/* Absolute top controls */}
        <TopControls
          mapRef={mapRef}
          council={council}
          onCouncilChange={setCouncil}
        />
      </MapContainer>

      {/* Right-docked details panel (desktop) / bottom sheet (mobile) */}
      <PopupPanel station={activeStation} onClose={handleClosePanel} />
    </div>
  );
}
