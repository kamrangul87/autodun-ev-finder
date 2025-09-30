'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Pane, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';

import TopControls, { CouncilOption } from '@/components/TopControls';
import PopupPanel from '@/components/PopupPanel';
import HeatmapWithScaling from '@/components/HeatmapWithScaling';
import ClusterLayer from '@/components/ClusterLayer';

/** Station shape kept local */
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

/** Make panes with stable z-indices */
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

/** Defensive wrapper so a heatmap error can’t crash the whole page */
function SafeHeatmap({ points, options }: { points: HeatPoint[]; options: Record<string, any> }) {
  try {
    if (!Array.isArray(points) || points.length === 0) return null;
    // Validate items
    const safe = points.filter(
      (p) =>
        typeof p?.lat === 'number' &&
        typeof p?.lng === 'number' &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng) &&
        typeof p?.value === 'number' &&
        Number.isFinite(p.value)
    );
    if (safe.length === 0) return null;
    return <HeatmapWithScaling points={safe} {...options} />;
  } catch {
    // swallow runtime errors to avoid white screen
    return null;
  }
}

export default function ClientMap({
  stations = [],
  initialCenter = [51.5072, -0.1276],
  initialZoom = 9,

  showHeatmap = true,
  showMarkers = true,
  showCouncil = true, // reserved for future council overlay toggle
  onStationsCount,
  heatOptions = {},
}: Props) {
  const mapRef = useRef<LeafletMap | null>(null);

  const [activeStation, setActiveStation] = useState<Station | null>(null);
  const [council, setCouncil] = useState<CouncilOption | null>(null);

  const filteredStations = useMemo(() => {
    if (!council) return stations;
    return stations.filter((s) => s.councilCode === council.value);
  }, [stations, council]);

  useEffect(() => {
    onStationsCount?.(filteredStations.length);
  }, [filteredStations.length, onStationsCount]);

  const handleMarkerClick = (s: Station) => setActiveStation(s);
  const handleClosePanel = () => setActiveStation(null);

  // Map to heat points safely
  const heatPoints: HeatPoint[] = useMemo(() => {
    return filteredStations
      .map((s) => {
        const lat = s.lat ?? s.latitude;
        const lng = s.lng ?? s.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number') return null;

        let value = 1;
        if (typeof s.connectors === 'number' && Number.isFinite(s.connectors)) value = s.connectors;
        else if (typeof s.connectors === 'string') {
          const n = parseFloat(s.connectors);
          if (Number.isFinite(n)) value = n;
        } else if (typeof s.reports === 'number' && s.reports > 0) value = s.reports;

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

        {/* Heatmap (toggleable, sandboxed) */}
        {showHeatmap && (
          <Pane name="heatmap">
            <SafeHeatmap points={heatPoints} options={heatOptions} />
          </Pane>
        )}

        {/* Markers / clusters (toggleable) */}
        {showMarkers && (
          <Pane name="clusters">
            <ClusterLayer stations={filteredStations} onMarkerClick={handleMarkerClick} visible />
          </Pane>
        )}

        {/* Top controls (measures height, sets CSS vars) */}
        <TopControls mapRef={mapRef} council={council} onCouncilChange={setCouncil} />
      </MapContainer>

      {/* Right-docked details panel / bottom sheet */}
      <PopupPanel station={activeStation} onClose={handleClosePanel} />
    </div>
  );
}
