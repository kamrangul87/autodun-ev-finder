'use client';

import React, { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  Pane,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import CouncilLayer from '@/components/CouncilLayer';

export type Station = {
  id: string | number;
  lat: number;
  lng: number;
  name?: string | null;
  addr?: string | null;
};

type Props = {
  /* match your page.tsx exactly */
  initialCenter?: [number, number];
  initialZoom?: number;

  showHeatmap?: boolean;   // rendered externally (no-op here unless you swap stub)
  showMarkers?: boolean;
  showCouncil?: boolean;

  stations?: Station[];    // page passes stations in
  onStationsCount?: (n: number) => void;
};

export default function ClientMap({
  initialCenter = [51.522, -0.126],
  initialZoom = 13,
  showHeatmap = false,
  showMarkers = true,
  showCouncil = false,
  stations = [],
  onStationsCount,
}: Props) {
  // keep your header counter in sync
  useEffect(() => {
    onStationsCount?.(stations.length);
  }, [stations.length, onStationsCount]);

  return (
    <div className="w-full h-[70vh]" style={{ position: 'relative' }}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        className="w-full h-full rounded-xl overflow-hidden"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Council polygons (pane zIndex keeps them under markers, over tiles) */}
        <CouncilLayer enabled={!!showCouncil} />

        {/* Markers (use a pane above polygons) */}
        {showMarkers && (
          <>
            <Pane name="stations-pane" style={{ zIndex: 400 }} />
            {stations.map((s) => (
              <CircleMarker
                key={`st-${s.id}`}
                center={[s.lat, s.lng]}
                radius={6}
                weight={2}
                opacity={1}
                fillOpacity={0.9}
                pane="stations-pane"
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
        )}

        {/* Heatmap placeholder (no UI, no rendering unless you replace it) */}
        {showHeatmap && <HeatmapLayer stations={stations} />}
      </MapContainer>
    </div>
  );
}

/* Stub so builds don’t break; replace with your real heatmap later */
function HeatmapLayer(_props: { stations: Station[] }) {
  return null;
}
