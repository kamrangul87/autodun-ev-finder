'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';

type Station = {
  id: number | string;
  name?: string;
  address?: string;
  postcode?: string;
  lat: number;
  lng: number;
  connectors?: number;
};

type Props = {
  initialCenter?: [number, number];
  initialZoom?: number;
};

export default function ClientMap({
  initialCenter = [51.5072, -0.1276],
  initialZoom = 10,
}: Props) {
  const mapRef = useRef<LeafletMap | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch Open Charge Map points near current center once on mount.
  useEffect(() => {
    const fetchOCM = async () => {
      try {
        const [lat, lng] = initialCenter;
        const url =
          `https://api.openchargemap.io/v3/poi/?output=json&countrycode=GB&maxresults=400` +
          `&compact=true&verbose=false&latitude=${lat}&longitude=${lng}&distance=25&distanceunit=KM`;
        const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
        if (!res.ok) throw new Error(`OCM ${res.status}`);
        const data = await res.json();

        const mapped: Station[] = (Array.isArray(data) ? data : [])
          .map((p: any) => ({
            id: p?.ID ?? Math.random(),
            name: p?.AddressInfo?.Title ?? 'EV Charging',
            address: p?.AddressInfo?.AddressLine1 ?? '',
            postcode: p?.AddressInfo?.Postcode ?? '',
            lat: Number(p?.AddressInfo?.Latitude),
            lng: Number(p?.AddressInfo?.Longitude),
            connectors: Array.isArray(p?.Connections) ? p.Connections.length : 0,
          }))
          .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

        setStations(mapped);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load stations');
        console.error('OCM fetch failed:', e);
      }
    };
    fetchOCM();
  }, [initialCenter]);

  const items = useMemo(
    () =>
      stations.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]}>
          <Popup>
            <div style={{ minWidth: 220 }}>
              <strong>{s.name}</strong>
              <div>{s.address}</div>
              <div>{s.postcode}</div>
              <div>Connectors: {s.connectors ?? 0}</div>
              <div style={{ marginTop: 8 }}>
                <a
                  href={`https://maps.google.com/?q=${s.lat},${s.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Google Maps
                </a>
              </div>
            </div>
          </Popup>
        </Marker>
      )),
    [stations]
  );

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
        <TileLayer
          attribution="&copy; OpenStreetMap contributors · Charging location data © Open Charge Map (CC BY 4.0)"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {items}
      </MapContainer>

      {/* Non-blocking, visible error (no white screen) */}
      {error && (
        <div
          style={{
            position: 'fixed',
            left: 12,
            bottom: 12,
            background: 'white',
            border: '1px solid rgba(0,0,0,0.1)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            padding: '8px 10px',
            borderRadius: 10,
            fontSize: 12,
            zIndex: 1200,
          }}
        >
          Data load error: {error}
        </div>
      )}
    </div>
  );
}
