'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Pane, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';

import HeatmapWithScaling from '@/components/HeatmapWithScaling';
import ClusterLayer from '@/components/ClusterLayer';
import PopupPanel from '@/components/PopupPanel';

/** ---------- Local types ---------- */
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
  initialCenter?: [number, number];
  initialZoom?: number;
};

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

/** Crash-proof boundary so a bad layer never white-screens the page */
class PartBoundary extends React.Component<
  { label: string; onTrip?: (label: string, err: any) => void; children: React.ReactNode },
  { tripped: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { tripped: false };
  }
  static getDerivedStateFromError() {
    return { tripped: true };
  }
  componentDidCatch(error: any) {
    this.props.onTrip?.(this.props.label, error);
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label}] crashed`, error);
  }
  render() {
    if (this.state.tripped) return null;
    return this.props.children as any;
  }
}

/** ---------- ClientMap ---------- */
export default function ClientMap({
  initialCenter = [51.5072, -0.1276],
  initialZoom = 9,
}: Props) {
  const mapRef = useRef<LeafletMap | null>(null);

  const [stations, setStations] = useState<Station[]>([]);
  const [activeStation, setActiveStation] = useState<Station | null>(null);
  const [heatOk, setHeatOk] = useState(true);
  const [markersOk, setMarkersOk] = useState(true);

  /** Fetch Open Charge Map by center+radius (simple, reliable) */
  const fetchStations = useCallback(async (lat: number, lng: number, km = 25) => {
    // Open Charge Map API — anonymous keyless usage is allowed but rate-limited.
    // If you have a key, append &key=YOUR_KEY
    const url = `https://api.openchargemap.io/v3/poi/?output=json&countrycode=GB&maxresults=750&compact=true&verbose=false&latitude=${lat}&longitude=${lng}&distance=${km}&distanceunit=KM`;
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error(`OCM fetch failed: ${res.status}`);
    const data = await res.json();

    // Map to our Station shape
    const mapped: Station[] = (Array.isArray(data) ? data : []).map((p: any) => ({
      id: p.ID,
      name: p.AddressInfo?.Title,
      address: p.AddressInfo?.AddressLine1,
      postcode: p.AddressInfo?.Postcode,
      source: 'ocm',
      connectors: Array.isArray(p.Connections) ? p.Connections.length : 0,
      lat: p.AddressInfo?.Latitude,
      lng: p.AddressInfo?.Longitude,
    }));

    setStations(mapped);
  }, []);

  /** Initial load + update when the user pans/zooms (debounced) */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const load = () => {
      const c = map.getCenter();
      fetchStations(c.lat, c.lng).catch((e) => console.error(e));
    };

    let t: any;
    const onMoveEnd = () => {
      clearTimeout(t);
      t = setTimeout(load, 350); // debounce a little
    };

    load();
    map.on('moveend', onMoveEnd);
    return () => {
      clearTimeout(t);
      map.off('moveend', onMoveEnd);
    };
  }, [fetchStations]);

  /** Heatmap points */
  const heatPoints: HeatPoint[] = useMemo(() => {
    return stations
      .map((s) => {
        const lat = s.lat ?? s.latitude;
        const lng = s.lng ?? s.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number') return null;

        let value = 1;
        if (typeof s.connectors === 'number' && Number.isFinite(s.connectors)) value = s.connectors;

        return { lat, lng, value };
      })
      .filter((p): p is HeatPoint => !!p);
  }, [stations]);

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
        style={{ height: 'calc(100vh - 120px)' }}
      >
        <EnsurePanes />

        {/* Base tiles */}
        <Pane name="base">
          <TileLayer
            attribution="&copy; OpenStreetMap contributors · Charging location data © Open Charge Map (CC BY 4.0)"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </Pane>

        {/* Heatmap (guarded) */}
        {heatOk && (
          <Pane name="heatmap">
            <PartBoundary label="heatmap" onTrip={() => setHeatOk(false)}>
              <HeatmapWithScaling points={heatPoints} />
            </PartBoundary>
          </Pane>
        )}

        {/* Markers/clusters (guarded) */}
        {markersOk && (
          <Pane name="clusters">
            <PartBoundary label="markers" onTrip={() => setMarkersOk(false)}>
              <ClusterLayer
                stations={stations}
                onMarkerClick={(s) => setActiveStation(s)}
                visible
              />
            </PartBoundary>
          </Pane>
        )}
      </MapContainer>

      {/* Right-docked details panel / bottom sheet */}
      <PopupPanel station={activeStation} onClose={() => setActiveStation(null)} />
    </div>
  );
}
