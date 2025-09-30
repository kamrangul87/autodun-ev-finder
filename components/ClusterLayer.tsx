'use client';

import React, { useMemo } from 'react';
import { Marker, Tooltip, Pane } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';

// Safe dynamic access: only try to load on the client, and only if installed.
let MarkerClusterGroup: any = null;
if (typeof window !== 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-leaflet-cluster');
    MarkerClusterGroup = mod?.default ?? null;
  } catch {
    MarkerClusterGroup = null;
  }
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
  visible?: boolean;
  pane?: string;
};

function getLatLng(s: Station): LatLngExpression | null {
  const lat = s.lat ?? s.latitude;
  const lng = s.lng ?? s.longitude;
  if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return [lat, lng] as LatLngExpression;
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
