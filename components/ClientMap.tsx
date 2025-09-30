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

/** The shape HeatmapWithScaling expects */
type HeatPoint = { lat: number; lng: number; value: number };

type Props = {
  stations?: Station[];
  initialCenter?: [number, number];
  initialZoom?: number;

  showHeatmap?: boolean;
  showMarkers?: boolean;
  showCouncil?: boolean;
  onStationsCount?: (n: number) => void;
  heatOptions?: Record<string, any>;
};

/** Create/normalize panes with predictable stacking */
function EnsurePanes() {
  const map = useMap();
  useEffect(() => {
    const defs: Array<[string, number, ('auto' | 'none')?]> = [
      ['base', 100, 'auto'],
      ['heatmap', 200, 'auto'],
      ['clusters', 300, 'auto'],
      ['popups', 400, 'auto'],
      ['ui', 1000, 'none'],
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

  showHeatmap = true,
  showMarkers = true,
  showCouncil = true, // reserved for future council-boundary overlay
  onStationsCount,
  heatOptions = {},
}: Props) {
  const mapRef = useRef<LeafletMap | null>(null);

  const [activeStation, setActiveStation] = useState<Station | null>(null);
  const [council, setCouncil] = useState<CouncilOption | null>(null);

  // Filter by selected council (if any)
  const filteredStations = useMemo(() => {
    if (!council) return stations;
    return stations.filter((s) => s.councilCode === council.value);
  }, [stations, council]);

  // Report count upward
  useEffect(() => {
    onStationsCount?.(filteredStations.length);
  }, [filteredStations.length, onStationsCount]);

  const handleMarkerClick = (s: Station) => setActiveStation(s);
  const handleClosePanel = () => setActiveStation(null);

  // Map stations -> heat points
  const heatPoints: HeatPoint[] = useMemo(() => {
    return filteredStations
      .map((s) => {
        const lat = s.lat ?? s.latitude;
        const lng = s.lng ?? s.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number') return null;

        // Derive an intensity value:
        // prefer a numeric connectors count; fallback to reports; else 1
        let value = 1;
        if (typeof s.connectors === 'number') value = s.connectors;
        else if (typeof s.connectors === 'string') {
          const n = parseFloat(s.connectors);
          if (!Number.isNaN(n)) value = n;
        } else if (typeof s.reports === 'number' && s.reports > 0) {
          value = s.reports;
        }
        return { lat, lng, value };
      })
      .filter((p): p is HeatPoint => !!p);
  }, [filteredStations]);

  return (
    <div className="map-root">
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        ref={(ref) => {
          if (ref) mapRef.current = ref;
        }}
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
            <HeatmapWithScaling points={heatPoints} {...heatOptions} />
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
