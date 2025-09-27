'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  useMap,
  CircleMarker,
  Tooltip,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import CouncilLayer from '@/components/CouncilLayer';

/* ------------------------------------------------------------
   Types
------------------------------------------------------------ */
export type Station = {
  id: string | number;
  lat: number;
  lng: number;
  name?: string | null;
  addr?: string | null;
};

type UncontrolledToggleProps = {
  /** If you manage toggles INSIDE ClientMap */
  defaultShowHeatmap?: boolean;
  defaultShowMarkers?: boolean;
  defaultShowCouncil?: boolean;
};

type ControlledToggleProps = {
  /** If you manage toggles from the parent (as in your page.tsx) */
  showHeatmap?: boolean;
  showMarkers?: boolean;
  showCouncil?: boolean;
};

type CenterZoomAliases = {
  /** Aliases to match your page.tsx */
  initialCenter?: [number, number];
  initialZoom?: number;
};

type CoreProps = {
  /** Back-compat aliases if you used these earlier */
  center?: [number, number];
  zoom?: number;

  /** Optional station list, if you render markers here */
  stations?: Station[];

  /** Parent callback: report current station count (matches your page.tsx) */
  onStationsCount?: (n: number) => void;
};

type Props = CoreProps & CenterZoomAliases & UncontrolledToggleProps & ControlledToggleProps;

/* ------------------------------------------------------------
   Layer toggles UI
------------------------------------------------------------ */
function LayerToggles({
  heatmapOn,
  setHeatmapOn,
  markersOn,
  setMarkersOn,
  councilOn,
  setCouncilOn,
  stationsCount,
  controlled, // when true, disable local toggles (parent controls)
}: {
  heatmapOn: boolean;
  setHeatmapOn: (v: boolean) => void;
  markersOn: boolean;
  setMarkersOn: (v: boolean) => void;
  councilOn: boolean;
  setCouncilOn: (v: boolean) => void;
  stationsCount: number;
  controlled: boolean;
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: controlled ? 0.7 : 1 }}>
          <input
            type="checkbox"
            checked={heatmapOn}
            onChange={(e) => !controlled && setHeatmapOn(e.target.checked)}
            disabled={controlled}
          />
          Heatmap
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: controlled ? 0.7 : 1 }}>
          <input
            type="checkbox"
            checked={markersOn}
            onChange={(e) => !controlled && setMarkersOn(e.target.checked)}
            disabled={controlled}
          />
          Markers
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: controlled ? 0.7 : 1 }}>
          <input
            type="checkbox"
            checked={councilOn}
            onChange={(e) => !controlled && setCouncilOn(e.target.checked)}
            disabled={controlled}
          />
          Council
        </label>

        <span style={{ opacity: 0.8 }}>stations: {stationsCount}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------
   Simple markers layer (safe stub; replace with your own if needed)
------------------------------------------------------------ */
function StationsMarkersLayer({ stations = [] as Station[] }) {
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
                {s.name && (
                  <div>
                    <strong>{s.name}</strong>
                  </div>
                )}
                {s.addr && <div>{s.addr}</div>}
              </div>
            </Tooltip>
          )}
        </CircleMarker>
      ))}
    </>
  );
}

/* ------------------------------------------------------------
   Main component
   - Accepts your prop names (initialCenter/initialZoom + showX)
   - Also supports center/zoom + defaultShowX for back-compat
------------------------------------------------------------ */
export default function ClientMap(props: Props) {
  // Center/Zoom aliases (prefer initialCenter/initialZoom if provided)
  const center: [number, number] =
    props.initialCenter ??
    props.center ??
    ([51.522, -0.126] as [number, number]); // London-ish
  const zoom: number = props.initialZoom ?? props.zoom ?? 13;

  const stations = props.stations ?? [];

  // Report stations count to parent (if callback provided)
  useEffect(() => {
    props.onStationsCount?.(stations.length);
  }, [stations.length, props]);

  // Determine controlled vs uncontrolled toggles
  const isControlled =
    typeof props.showHeatmap !== 'undefined' ||
    typeof props.showMarkers !== 'undefined' ||
    typeof props.showCouncil !== 'undefined';

  // Local state (used when not controlled)
  const [heatmapOn, setHeatmapOn] = useState<boolean>(
    props.defaultShowHeatmap ?? false
  );
  const [markersOn, setMarkersOn] = useState<boolean>(
    props.defaultShowMarkers ?? true
  );
  const [councilOn, setCouncilOn] = useState<boolean>(
    props.defaultShowCouncil ?? false
  );

  // Effective values (controlled wins if present)
  const effHeatmap = typeof props.showHeatmap === 'boolean' ? props.showHeatmap : heatmapOn;
  const effMarkers = typeof props.showMarkers === 'boolean' ? props.showMarkers : markersOn;
  const effCouncil = typeof props.showCouncil === 'boolean' ? props.showCouncil : councilOn;

  return (
    <div className="w-full h-[70vh]" style={{ position: 'relative' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full rounded-xl overflow-hidden"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* ✅ Council polygons (doesn't touch stations fetching) */}
        <CouncilLayer enabled={effCouncil} />

        {/* Heatmap — replace with your real component if you have one */}
        {effHeatmap && <HeatmapLayer stations={stations} />}

        {/* Markers */}
        {effMarkers && <StationsMarkersLayer stations={stations} />}

        {/* UI controls */}
        <LayerToggles
          heatmapOn={effHeatmap}
          setHeatmapOn={setHeatmapOn}
          markersOn={effMarkers}
          setMarkersOn={setMarkersOn}
          councilOn={effCouncil}
          setCouncilOn={setCouncilOn}
          stationsCount={stations.length}
          controlled={isControlled}
        />
      </MapContainer>
    </div>
  );
}

/* ------------------------------------------------------------
   STUB: Replace with your actual heatmap if present
------------------------------------------------------------ */
function HeatmapLayer(_props: { stations: Station[] }) {
  return null;
}
