'use client';

import React, { useMemo } from 'react';
import { Marker, Tooltip, Pane } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';

// Use clustering if available; otherwise fall back to plain markers.
let MarkerClusterGroup: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  MarkerClusterGroup = require('react-leaflet-cluster').default;
} catch {
  MarkerClusterGroup = null;
}

/** Minimal station shape used by the layer */
export type Station = {
  id?: string | number;
  name?: string;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  postcode?: string;
  councilCode?: string;
  source?: string;
  connectors?: number | string;
};

type Props = {
  stations: Station[];
  onMarkerClick: (s: Station) => void;
  visible?: boolean;             // allow hide/show from toggles
  pane?: string;                 // Leaflet pane; default matches our z-index setup
};

function getLatLng(s: Station): LatLngExpression | null {
  const lat = s.lat ?? s.latitude;
  const lng = s.lng ?? s.longitude;
  if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return [lat, lng];
  }
  return null;
}

export default function ClusterLayer({
  stations,
  onMarkerClick,
  visible = true,
  pane = 'clusters',
}: Props) {
  const items = useMemo(
    () =>
      stations
        .map((s) => ({ s, ll: getLatLng(s) }))
        .filter((x) => x.ll !== null) as { s: Station; ll: LatLngExpression }[],
    [stations]
  );

  if (!visible) return null;

  const renderMarker = (s: Station, ll: LatLngExpression) => (
    <Marker
      key={(s.id ?? `${(s.lat ?? s.latitude)?.toFixed?.(6)}:${(s.lng ?? s.longitude)?.toFixed?.(6)}`) as React.Key}
      position={ll}
      pane={pane}
      eventHandlers={{ click: () => onMarkerClick(s) }}
    >
      {s.name ? (
        <Tooltip direction="top" offset={[0, -6]} opacity={0.9}>
          {s.name}
        </Tooltip>
      ) : null}
    </Marker>
  );

  if (MarkerClusterGroup) {
    return (
      <Pane name={pane}>
        <MarkerClusterGroup
          chunkedLoading
          showCoverageOnHover={false}
          spiderfyOnEveryZoom={false}
          maxClusterRadius={48}
        >
          {items.map(({ s, ll }) => renderMarker(s, ll))}
        </MarkerClusterGroup>
      </Pane>
    );
  }

  // Fallback: plain markers
  return <Pane name={pane}>{items.map(({ s, ll }) => renderMarker(s, ll))}</Pane>;
}
