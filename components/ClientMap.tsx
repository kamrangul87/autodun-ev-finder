'use client';

import React, { useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  useMap,
  CircleMarker,
  Tooltip,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import CouncilLayer from '@/components/CouncilLayer';

// -------- Types you likely already have --------
export type Station = {
  id: string | number;
  lat: number;
  lng: number;
  name?: string | null;
  addr?: string | null;
};

type Props = {
  /** initial map center (lat, lng) */
  center?: [number, number];
  /** initial zoom */
  zoom?: number;

  /** your stations array (if you fetch inside this component, you can ignore this prop) */
  stations?: Station[];

  /** if you already maintain these toggles outside, pass them down & control via props (optional) */
  defaultShowHeatmap?: boolean;
  defaultShowMarkers?: boolean;
  defaultShowCouncil?: boolean;
};

/**
 * Top-right UI for toggles and count
 */
function LayerToggles({
  showHeatmap,
  setShowHeatmap,
  showMarkers,
  setShowMarkers,
  showCouncil,
  setShowCouncil,
  stationsCount,
}: {
  showHeatmap: boolean;
  setShowHeatmap: (v: boolean) => void;
  showMarkers: boolean;
  setShowMarkers: (v: boolean) => void;
  showCouncil: boolean;
  setShowCouncil: (v: boolean) => void;
  stationsCount: number;
}) {
  return (
    <div
      className="leaflet-top leaflet-right"
      style={{ pointerEvents: 'none', zIndex: 1000 }}
    >
      <div
        className="leaflet-control"
        style={{
          pointerEvents: 'auto',
          background: '#fff',
          padding: '6px 10px',
          borderRadius: 8,
          boxShadow:
            '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 14,
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={showHeatmap}
            onChange={(e) => setShowHeatmap(e.target.checked)}
          />
          Heatmap
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={showMarkers}
            onChange={(e) => setShowMarkers(e.target.checked)}
          />
          Markers
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={showCouncil}
            onChange={(e) => setShowCouncil(e.target.checked)}
          />
          Council
        </label>

        <span style={{ opacity: 0.8 }}>stations: {stationsCount}</span>
      </div>
    </div>
  );
}

/**
 * Simple markers layer (uses CircleMarker so no icon images required).
 * If you already have your own StationsMarkers component, replace this with your import.
 */
function StationsMarkersLayer({ stations = [] as Station[] }) {
  const map = useMap();
  // stable key to avoid re-mount spam
  const key = useMemo(() => `stations-${stations.length}`, [stations.length]);

  return (
    <>
      {stations.map((s) => (
        <CircleMarker
          key={`${key}-${s.id}`}
          center={[s.lat, s.lng]}
          radius={6}
          weight={2}
          opacity={1}
          fillOpacity={0.9}
        >
          {(s.name || s.addr) && (
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <div style={{ fontSize: 12 }}>
                {s.name && <div><strong>{s.name}</strong></div>}
                {s.addr && <div>{s.addr}</div>}
              </div>
            </Tooltip>
          )}
        </CircleMarker>
      ))}
    </>
  );
}

export default function ClientMap({
  center = [51.522, -0.126], // London-ish
  zoom = 13,
  stations = [],
  defaultShowHeatmap = false,
  defaultShowMarkers = true,
  defaultShowCouncil = false,
}: Props) {
  const [showHeatmap, setShowHeatmap] = useState(defaultShowHeatmap);
  const [showMarkers, setShowMarkers] = useState(defaultShowMarkers);
  const [showCouncil, setShowCouncil] = useState(defaultShowCouncil);

  const stationsCount = stations?.length ?? 0;

  return (
    <div className="w-full h-[70vh]" style={{ position: 'relative' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full rounded-xl overflow-hidden"
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Council polygons – this is the only addition required for Step 4 */}
        <CouncilLayer enabled={showCouncil} />

        {/* Heatmap (replace stub with your actual heatmap component if you have one) */}
        {showHeatmap && <HeatmapLayer stations={stations} />}

        {/* Markers */}
        {showMarkers && <StationsMarkersLayer stations={stations} />}

        {/* UI controls */}
        <LayerToggles
          showHeatmap={showHeatmap}
          setShowHeatmap={setShowHeatmap}
          showMarkers={showMarkers}
          setShowMarkers={setShowMarkers}
          showCouncil={showCouncil}
          setShowCouncil={setShowCouncil}
          stationsCount={stationsCount}
        />
      </MapContainer>
    </div>
  );
}

/* ------------------------------------------------------------------
   STUBS: Replace with your actual components if you already have them
-------------------------------------------------------------------*/

/**
 * Replace this with your real heatmap implementation.
 * Keeping a stub here prevents TypeScript/compile errors.
 */
function HeatmapLayer(_props: { stations: Station[] }) {
  return null;
}
