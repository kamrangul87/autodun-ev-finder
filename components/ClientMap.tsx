'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Pane, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';

import TopControls, { CouncilOption } from '@/components/TopControls';
import PopupPanel from '@/components/PopupPanel';
import HeatmapWithScaling from '@/components/HeatmapWithScaling';
import ClusterLayer from '@/components/ClusterLayer';

/** Minimal station shape (local to avoid path aliases) */
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

  /** From page.tsx (all optional) */
  showHeatmap?: boolean;
  showMarkers?: boolean;
  showCouncil?: boolean; // kept for parity; we already filter by council state
  onStationsCount?: (n: number) => void;
  heatOptions?: Record<string, any>; // forwarded to HeatmapWithScaling
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

  showHeatmap = true,
  showMarkers = true,
  showCouncil = true, // currently not used to hide any layer, but kept for compatibility
  onStationsCount,
  heatOptions = {},
}: Props) {
  const mapRef = useRef<LeafletMap | null>(null);

  // Right-docked/bottom-sheet panel state
  const [activeStation, setActiveStation] = useState<Station | null>(null);

  // Optional council filter (TopControls can change it)
  const [council, setCouncil] = useState<CouncilOption | null>(null);

  // Apply council filtering locally
  const filteredStations = useMemo(() => {
    if (!council) return stations;
    return stations.filter((s) => s.councilCode === council.value);
  }, [stations, council]);

  // Report station count to parent when it changes
  useEffect(() => {
    if (typeof onStationsCount === 'function') {
      onStationsCount(filteredStations.length);
    }
  }, [filteredStations.length, onStationsCount]);

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

        {/* Heatmap (toggleable) */}
        {showHeatmap && (
          <Pane name="heatmap">
            {/* Forward any heatmap tuning via heatOptions */}
            <HeatmapWithScaling points={filteredStations} {...heatOptions} />
          </Pane>
        )}

        {/* Markers / clusters (toggleable; click opens React panel) */}
        {showMarkers && (
          <Pane name="clusters">
            <ClusterLayer
              stations={filteredStations}
              onMarkerClick={handleMarkerClick}
              visible
            />
          </Pane>
        )}

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
