"use client";
import { useEffect, useState, useRef } from 'react';
import { useInvalidateOnResize } from '../../lib/hooks/useInvalidateOnResize';
import { MapContainer, TileLayer, Pane, Marker, Popup, ZoomControl, GeoJSON } from 'react-leaflet';
import type { Station } from '../../types/stations';
// HeatLayer import not needed; use leaflet.heat directly
import { createStationDivIcon } from '../../lib/icons/stationDivIcon';

export default function ClientMap({ bounds, councilGeoJson, showCouncil, heatOn, markersOn, onZoomToData }: {
  bounds: [[number, number], [number, number]];
  councilGeoJson?: any;
  showCouncil: boolean;
  heatOn: boolean;
  markersOn: boolean;
  onZoomToData: () => void;
}) {
  const [map, setMap] = useState<any>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);
  useInvalidateOnResize(map);

  // Guards for programmatic moves and one-time auto-center
  const isProgrammaticMove = useRef(false);
  const userInteracted = useRef(false);
  const hasAutoCentered = useRef(false);
  const fetchTimer = useRef<number | undefined>(undefined);
  const heatLayerRef = useRef<any>(null);
  const councilLayerRef = useRef<any>(null);

  // Track real user interaction
  useEffect(() => {
    if (!map) return;
    const mark = () => { userInteracted.current = true; };
    map.on('dragstart', mark);
    map.on('zoomstart', mark);
    map.on('movestart', mark);
    return () => {
      map.off('dragstart', mark);
      map.off('zoomstart', mark);
      map.off('movestart', mark);
    };
  }, [map]);
  // Council pane setup
  useEffect(() => {
    if (!map) return;
    if (!map.getPane('councils')) {
      map.createPane('councils');
      map.getPane('councils')!.style.zIndex = '300';
    }
  }, [map]);
  // Council overlay logic
  useEffect(() => {
    if (!map) return;
    if (!showCouncil) {
      if (councilLayerRef.current && map.hasLayer(councilLayerRef.current)) {
        map.removeLayer(councilLayerRef.current);
      }
      return;
    }
    if (councilLayerRef.current && map.hasLayer(councilLayerRef.current)) return;
    if (!councilGeoJson) return;
    (async () => {
      const L = (await import('leaflet')).default;
      const baseStyle = { color: '#2563eb', weight: 2, fillColor: '#60a5fa', fillOpacity: 0.10 };
      const highlight = { weight: 3, fillOpacity: 0.22 };
      const layer = L.geoJSON(councilGeoJson, {
        pane: 'councils',
        style: () => baseStyle,
        onEachFeature: (feature, layer) => {
          layer.on({
            mouseover: () => (layer as any).setStyle(highlight),
            mouseout: () => (layer as any).setStyle(baseStyle),
          });
          const name = feature?.properties?.name || feature?.properties?.NAME || feature?.properties?.Borough;
          if (name) {
            layer.bindTooltip(name, { direction: 'top', className: 'council-tooltip', sticky: true });
          }
        },
      });
      councilLayerRef.current = layer;
      layer.addTo(map);
    })();
    return () => {
      if (councilLayerRef.current && map.hasLayer(councilLayerRef.current)) {
        map.removeLayer(councilLayerRef.current);
      }
    };
  }, [map, showCouncil, councilGeoJson]);

  // Fetch stations after map is ready and on moveend (debounced, guarded)
  useEffect(() => {
    if (!map) return;
    const fetchStations = async () => {
      setLoading(true);
      const b = map.getBounds();
      const bbox = `(${b.getSouth()},${b.getWest()}),(${b.getNorth()},${b.getEast()})`;
      const url = `/api/stations?bbox=${encodeURIComponent(bbox)}&max=200`;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        setStations(Array.isArray(data.items) ? data.items : []);
        setSource(data.source ?? '');
        setDebug(data.debug ?? {});
      } catch {
        setStations([]);
      } finally {
        setLoading(false);
      }
    };
    fetchStations();
    const onMoveEnd = () => {
      if (isProgrammaticMove.current) return;
      if (!userInteracted.current) return;
      if (fetchTimer.current) window.clearTimeout(fetchTimer.current);
      fetchTimer.current = window.setTimeout(fetchStations, 500);
    };
    map.on('moveend', onMoveEnd);
    return () => {
      map.off('moveend', onMoveEnd);
      if (fetchTimer.current) window.clearTimeout(fetchTimer.current);
    };
  }, [map]);

  // One-time auto-center to data after first stations fetch
  useEffect(() => {
    if (!map || stations.length === 0 || hasAutoCentered.current) return;
    (async () => {
      const L = (await import('leaflet')).default;
      const bounds = L.latLngBounds(stations.map(s => [s.lat, s.lng]));
      isProgrammaticMove.current = true;
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12, animate: false });
      map.once('moveend', () => { isProgrammaticMove.current = false; });
      hasAutoCentered.current = true;
    })();
  }, [map, stations]);

  const [source, setSource] = useState('');
  const [debug, setDebug] = useState<any>({});

  // Removed auto-fit effect: map does not auto-pan/zoom on stations change

  // Stronger heatmap layer logic
  useEffect(() => {
    if (!map) return;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet.heat');
      if (!heatLayerRef.current) {
        heatLayerRef.current = (L as any).heatLayer([], {
          radius: 36,
          blur: 24,
          maxZoom: 19,
          gradient: {
            0.2:'#4FC3F7', 0.4:'#4CAF50', 0.6:'#FFC107', 0.8:'#FF5722', 1:'#E53935'
          }
        });
      }
      if (heatOn) {
        if (!map.hasLayer(heatLayerRef.current)) {
          heatLayerRef.current.addTo(map);
        }
      } else {
        if (map.hasLayer(heatLayerRef.current)) {
          map.removeLayer(heatLayerRef.current);
        }
      }
      // Update heat data
      if (heatLayerRef.current && stations.length) {
        const weight = (c?: any) => {
          let w = Array.isArray(c) ? c.length : (c ?? 1);
          return Math.max(0.5, Math.min(1.0, w / 2.5));
        };
        const pts = stations.map(s => [s.lat, s.lng, weight(s.connectors)]);
        heatLayerRef.current.setLatLngs(pts);
      }
    })();
    return () => {
      if (map && heatLayerRef.current && map.hasLayer(heatLayerRef.current)) {
        map.removeLayer(heatLayerRef.current);
      }
    };
  }, [map, stations, heatOn]);
  return (
    <div className="relative h-full w-full">
      <MapContainer
        className="h-full w-full"
        style={{ height: '100%', width: '100%', minHeight: '75vh' }}
        center={[51.515, -0.141]}
        zoom={13}
        scrollWheelZoom
        preferCanvas
        ref={node => { if (node) setMap(node); }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        <ZoomControl position="topright" />
        {markersOn && (
          <Pane name="stations" style={{ zIndex: 650 }}>
            {stations.map(s => (
              <Marker key={String(s.id)} position={[s.lat, s.lng]} icon={createStationDivIcon(28)}>
                <Popup>
                  <b>{s.name ?? 'Charging station'}</b><br/>
                  {s.address ?? ''}<br/>{s.postcode ?? ''}<br/>
                  {Array.isArray(s.connectors) ? `${s.connectors.length} connectors` : null}
                </Popup>
              </Marker>
            ))}
          </Pane>
        )}
        {/* Heatmap is now managed via leaflet.heat and heatLayerRef */}
        {/* Council overlay is managed via leaflet geoJSON layer above; no direct GeoJSON here */}
      </MapContainer>
      <div className="absolute bottom-2 left-2 text-xs bg-white/80 rounded px-2 py-1 shadow z-[1200]">
        Data: Open Charge Map
      </div>
    </div>
  );
}
