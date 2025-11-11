// components/EnhancedMapV2.jsx
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import StationDrawer from './StationDrawer.tsx';
import { LocateMeButton } from './LocateMeButton.tsx';
import { getCached, setCache } from '../lib/api-cache';
import { telemetry } from '../utils/telemetry.ts';
import { findNearestStation } from '../utils/haversine.ts';

/* ──────────────────────────────────────────────────────────────
   OCM connector normalization
   ────────────────────────────────────────────────────────────── */
const ID2 = {
  1: 'Type 2',
  2: 'CHAdeMO',
  25: 'Type 2',
  32: 'CCS',
  33: 'CCS',
  1036: 'Type 2',
  8: 'Type 2',
  27: 'Type 2',
  30: 'CHAdeMO'
};

const canon = (t = '') => {
  t = t.toLowerCase();
  if (t.includes('ccs') || t.includes('combo')) return 'CCS';
  if (t.includes('chademo')) return 'CHAdeMO';
  if (t.includes('type 2') || t.includes('type-2') || (t.includes('iec 62196') && t.includes('type 2'))) return 'Type 2';
  return 'Unknown';
};

const mapOCM = (conns) =>
  Array.isArray(conns)
    ? conns.reduce((acc, c) => {
        const id = Number(c?.ConnectionTypeID ?? c?.ConnectionType?.ID);
        const label =
          ID2[id] ??
          canon(
            c?.ConnectionType?.Title ||
              c?.ConnectionType?.FormalName ||
              c?.CurrentType?.Title ||
              c?.Level?.Title
          );
        acc.push({
          type: label,
          quantity: typeof c?.Quantity === 'number' && c.Quantity > 0 ? c.Quantity : 1,
          powerKW: typeof c?.PowerKW === 'number' ? c.PowerKW : undefined
        });
        return acc;
      }, [])
    : [];

if (typeof window !== 'undefined') {
  // fix default marker icons
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
  });
}

const councilIcon = L.divIcon({
  html:
    '<div style="background:#9333ea;width:14px;height:14px;transform:rotate(45deg);border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.4)"></div>',
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const userLocationIcon = L.divIcon({
  html:
    '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 6px rgba(59,130,246,0.6)"></div>',
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

function MapInitializer() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

/* ──────────────────────────────────────────────────────────────
   Heatmap
   ────────────────────────────────────────────────────────────── */
function HeatmapLayer({ stations, intensity = 1 }) {
  const map = useMap();
  const heatLayerRef = useRef(null);
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const updateZoom = () => setZoom(map.getZoom());
    map.on('zoomend', updateZoom);
    return () => map.off('zoomend', updateZoom);
  }, [map]);

  useEffect(() => {
    if (!map || !stations || stations.length === 0) {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      return;
    }

    import('leaflet.heat').then(() => {
      if (heatLayerRef.current) map.removeLayer(heatLayerRef.current);

      const currentZoom = map.getZoom();
      const radius = Math.max(12, Math.min(35, 35 - (currentZoom - 10) * 2.3));

      let processedStations = stations;
      if (stations.length > 25000) {
        processedStations = stations.filter((_, idx) => idx % 3 === 0);
      }

      const maxIntensity = Math.max(...processedStations.map((s) => s.connectors || 1));
      const heatData = processedStations.map((s) => [
        s.lat,
        s.lng,
        ((s.connectors || 1) / maxIntensity) * intensity
      ]);

      // eslint-disable-next-line no-undef
      heatLayerRef.current = L.heatLayer(heatData, {
        radius,
        blur: 15,
        maxZoom: 17,
        max: 1.0,
        gradient: { 0.0: 'green', 0.4: 'yellow', 0.7: 'orange', 1.0: 'red' }
      }).addTo(map);
    });

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [map, stations, intensity, zoom]);

  return null;
}

function StationMarker({ station, onClick }) {
  return (
    <Marker
      position={[station.lat, station.lng]}
      eventHandlers={{ click: () => onClick(station) }}
    />
  );
}

/* ──────────────────────────────────────────────────────────────
   NEW: Council polygons overlay with click → set code & bbox
   ────────────────────────────────────────────────────────────── */
function CouncilBoundaryLayer({ showCouncil, onSelect, onBBox }) {
  const map = useMap();
  const layerRef = useRef(null);
  const lastBboxRef = useRef(null);
  const fetchTimeoutRef = useRef(null);

  const fetchPolys = useCallback(async () => {
    if (!showCouncil) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      lastBboxRef.current = null;
      return;
    }

    const b = map.getBounds();
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const bboxStr = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;

    if (lastBboxRef.current === bboxStr) return;

    const cacheKey = `council_poly_${bboxStr}`;
    const cached = getCached(cacheKey);

    const addLayer = (gj) => {
      if (layerRef.current) map.removeLayer(layerRef.current);
      layerRef.current = L.geoJSON(gj, {
        style: { color: '#2563eb', weight: 1, fillOpacity: 0.08 },
        onEachFeature: (f, layer) => {
          const { name, code } = f.properties || {};
          // compute bbox from layer bounds (Leaflet returns [lat,lng])
          const ll = layer;
          if (ll && 'getBounds' in ll) {
            const lb = ll.getBounds();
            const bb = [lb.getWest(), lb.getSouth(), lb.getEast(), lb.getNorth()];
            (f.properties ||= {}).bbox = bb;
          }
          layer.bindPopup(`<strong>${name || 'Council'}</strong><br>${code || ''}`);
          layer.on('click', () => {
            const bb = f?.properties?.bbox;
            if (bb && Array.isArray(bb) && bb.length === 4) {
              onBBox?.(bb);
              map.fitBounds([[bb[1], bb[0]], [bb[3], bb[2]]], { padding: [18, 18] });
            }
            onSelect?.(code || null);
          });
        },
      }).addTo(map);
      lastBboxRef.current = bboxStr;
    };

    if (cached?.geojson) {
      addLayer(cached.geojson);
      return;
    }

    try {
      // API accepts mode=bbox (it may ignore bbox filter; harmless)
      const res = await fetch(`/api/council?mode=bbox&bbox=${bboxStr}`, { cache: 'no-store' });
      const gj = await res.json();
      addLayer(gj);
      setCache(cacheKey, { geojson: gj });
    } catch (e) {
      console.error('[CouncilBoundaryLayer] fetch error:', e);
    }
  }, [map, showCouncil, onBBox, onSelect]);

  useMapEvents({
    moveend: () => {
      if (!showCouncil) return;
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(fetchPolys, 300);
    },
  });

  useEffect(() => {
    fetchPolys();
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [fetchPolys]);

  return null;
}

/* Existing council markers (points), unchanged */
function CouncilMarkerLayer({ showCouncil, onMarkerClick }) {
  const map = useMap();
  const [councilStations, setCouncilStations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchTimeoutRef = useRef(null);
  const lastBboxRef = useRef(null);

  const fetchCouncilData = useCallback(async () => {
    if (!showCouncil) {
      setCouncilStations([]);
      return;
    }

    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const bboxStr = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;

    if (lastBboxRef.current === bboxStr) return;

    const cacheKey = `council_${bboxStr}`;
    const cached = getCached(cacheKey);
    if (cached) {
      setCouncilStations(cached.items || []);
      lastBboxRef.current = bboxStr;
      return;
    }

    try {
      setIsLoading(true);
      const url = `/api/council-stations?bbox=${bboxStr}`;
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json();

      if (response.ok && data.features) {
        const items = data.features.map((f) => ({
          id: f.properties.id,
          name: f.properties.title || f.properties.AddressInfo?.Title,
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          address: f.properties.AddressInfo?.AddressLine1,
          connectors: f.properties.NumberOfPoints,
          isCouncil: true
        }));

        setCouncilStations(items);
        setCache(cacheKey, { items, count: items.length });
        lastBboxRef.current = bboxStr;

        telemetry.councilSelected('viewport', items.length);
      }
    } catch (error) {
      console.error('[CouncilMarkerLayer] Fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [map, showCouncil]);

  useMapEvents({
    moveend: () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => fetchCouncilData(), 250);
    }
  });

  useEffect(() => {
    fetchCouncilData();
  }, [fetchCouncilData, showCouncil]);

  if (!showCouncil || councilStations.length === 0) return null;

  return (
    <MarkerClusterGroup chunkedLoading>
      {councilStations.map((station) => (
        <Marker
          key={`council-${station.id}`}
          position={[station.lat, station.lng]}
          icon={councilIcon}
          eventHandlers={{ click: () => onMarkerClick(station) }}
        />
      ))}
    </MarkerClusterGroup>
  );
}

function UserLocationMarker({ location, accuracy }) {
  if (!location) return null;

  return (
    <>
      <Circle
        center={[location.lat, location.lng]}
        radius={accuracy || 100}
        pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 1 }}
      />
      <Marker position={[location.lat, location.lng]} icon={userLocationIcon} />
    </>
  );
}

/* ──────────────────────────────────────────────────────────────
   Viewport → fetch stations. If councilBBox provided, use it.
   ────────────────────────────────────────────────────────────── */
function ViewportFetcher({
  onFetchStations,
  onLoadingChange,
  searchResult,
  shouldZoomToData,
  stations,
  showCouncil,
  councilBBox
}) {
  const map = useMap();
  const fetchTimeoutRef = useRef(null);
  const lastFetchRef = useRef(null);
  const isFirstFetchRef = useRef(true);

  const fetchForBBox = useCallback(
    async (bboxStr, isFirstLoad = false) => {
      if (!bboxStr || lastFetchRef.current === bboxStr) return;

      const cacheKey = `bbox_${bboxStr}`;
      const cached = getCached(cacheKey);
      if (cached) {
        lastFetchRef.current = bboxStr;
        onFetchStations?.(cached);
        return;
      }

      try {
        onLoadingChange?.(true);
        const tiles = isFirstLoad ? 4 : 2;
        const limitPerTile = isFirstLoad ? 500 : 750;
        const url = `/api/stations?bbox=${bboxStr}&tiles=${tiles}&limitPerTile=${limitPerTile}`;
        const response = await fetch(url, { cache: 'no-store' });
        const data = await response.json();
        if (response.ok) {
          const normalizedData = {
            items: data.features ? data.features.map((f) => f.properties) : [],
            count: data.count,
            source: data.source,
            bbox: data.bbox
          };
          setCache(cacheKey, normalizedData);
          lastFetchRef.current = bboxStr;
          onFetchStations?.(normalizedData);
        } else {
          console.error('API error:', data.error || 'Failed to fetch stations');
        }
      } catch (error) {
        console.error('Viewport fetch error:', error);
        lastFetchRef.current = null;
      } finally {
        onLoadingChange?.(false);
      }
    },
    [onFetchStations, onLoadingChange]
  );

  // Fetch whenever councilBBox changes
  useEffect(() => {
    if (showCouncil && councilBBox && councilBBox.length === 4) {
      const bboxStr = councilBBox.join(',');
      fetchForBBox(bboxStr, true);
    }
  }, [showCouncil, councilBBox, fetchForBBox]);

  // Default viewport-driven fetch (only when NOT locked to council bbox)
  const fetchForViewport = useCallback(
    (isFirstLoad = false) => {
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const bboxStr = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
      fetchForBBox(bboxStr, isFirstLoad);
    },
    [map, fetchForBBox]
  );

  useMapEvents({
    moveend: () => {
      if (showCouncil && councilBBox) return; // locked to council bbox → ignore pan
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => fetchForViewport(false), 400);
    }
  });

  useEffect(() => {
    if (isFirstFetchRef.current && stations && stations.length > 0) {
      const bboxStr = `-8.649,49.823,1.763,60.845`;
      lastFetchRef.current = bboxStr;
      isFirstFetchRef.current = false;
    }
  }, [map, stations]);

  useEffect(() => {
    if (searchResult) {
      map.setView([searchResult.lat, searchResult.lng], 13);
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => {
        if (showCouncil && councilBBox) {
          fetchForBBox(councilBBox.join(','), false);
        } else {
          fetchForViewport(false);
        }
      }, 500);
    }
  }, [map, searchResult, fetchForViewport, fetchForBBox, showCouncil, councilBBox]);

  useEffect(() => {
    if (shouldZoomToData && stations && stations.length > 0) {
      const bounds = L.latLngBounds(stations.map((s) => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, stations, shouldZoomToData]);

  return null;
}

function LocateMeControl({ onLocationChange, onError }) {
  const handleLocationFound = (lat, lng, accuracy) => {
    onLocationChange({ lat, lng }, accuracy);
  };

  return (
    <div className="leaflet-top leaflet-right" style={{ marginTop: '80px', marginRight: '10px' }}>
      <div className="leaflet-control">
        <LocateMeButton onLocationFound={handleLocationFound} onError={onError} />
      </div>
    </div>
  );
}

export default function EnhancedMap({
  stations = [],
  showHeatmap = false,
  showMarkers = true,
  showCouncil = false,
  searchResult = null,
  shouldZoomToData = false,
  userLocation: externalUserLocation,
  onFetchStations,
  onLoadingChange,
  onToast,
  isLoading = false,
  /* NEW (tiny state sync from page/URL) */
  councilCode = null,
  councilBBox = null,
  onCouncilSelect,
  onCouncilBBox
}) {
  const [activeStation, setActiveStation] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const mapRef = useRef(null);

  /* Normalize stations */
  const stationsNormalized = useMemo(
    () =>
      (stations || []).map((s) => {
        const existingDetailed = s?.connectorsDetailed || s?.properties?.connectorsDetailed;
        if (Array.isArray(existingDetailed) && existingDetailed.length) {
          const detailed = existingDetailed.map((c) => ({
            type: canon(c?.type || 'Unknown'),
            quantity: typeof c?.quantity === 'number' && c.quantity > 0 ? c.quantity : 1,
            powerKW: typeof c?.powerKW === 'number' ? c.powerKW : undefined
          }));
          const totalCount = detailed.reduce((sum, c) => sum + (c.quantity || 0), 0);
          return { ...s, connectorsDetailed: detailed, connectors: totalCount };
        }
        const conns = s?.Connections || s?.properties?.Connections;
        if (Array.isArray(conns) && conns.length) {
          const detailed = mapOCM(conns);
          if (detailed.length) {
            const totalCount = detailed.reduce((sum, c) => sum + (c.quantity || 0), 0);
            return { ...s, connectorsDetailed: detailed, connectors: totalCount };
          }
        }
        return s;
      }),
    [stations]
  );

  /* external location → center */
  useEffect(() => {
    if (externalUserLocation && mapRef.current) {
      setUserLocation(externalUserLocation);
      mapRef.current.setView(
        [externalUserLocation.lat, externalUserLocation.lng],
        Math.max(mapRef.current.getZoom(), 14)
      );
    }
  }, [externalUserLocation]);

  const handleStationClick = useCallback((station) => {
    setActiveStation(station);
    telemetry.drawerOpen(station.id, station.isCouncil || false);
  }, []);

  const handleDrawerClose = useCallback(() => setActiveStation(null), []);

  /* POST feedback */
  const handleFeedbackSubmit = useCallback(
    async (stationId, vote, comment) => {
      try {
        const voteNorm = vote === 'up' ? 'good' : vote === 'down' ? 'bad' : String(vote || '');
        const lat = activeStation?.lat ?? activeStation?.Latitude ?? null;
        const lng = activeStation?.lng ?? activeStation?.Longitude ?? null;

        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stationId, vote: voteNorm, comment: comment || '', lat, lng, ts: new Date().toISOString() })
        });
        if (!res.ok) throw new Error(`feedback POST failed: ${res.status}`);
        onToast?.({ message: '✓ Thanks for your feedback!', type: 'success' });
      } catch (err) {
        console.error('[feedback] submit error', err);
        onToast?.({ message: 'Saved locally — network issue. Please try again in a moment.', type: 'error' });
      }
    },
    [onToast, activeStation]
  );

  const handleLocationChange = useCallback(
    (location, accuracy) => {
      setUserLocation(location);
      setLocationAccuracy(accuracy);
      if (mapRef.current && location) {
        mapRef.current.setView([location.lat, location.lng], 14);
        const nearest = findNearestStation(location, stationsNormalized);
        if (nearest) {
          console.log(`[Location] Nearest station: ${nearest.station.name} (${nearest.distance.toFixed(2)} km)`);
        }
      }
    },
    [stationsNormalized]
  );

  const handleLocationError = useCallback(
    (error) => onToast?.({ message: error, type: 'error' }),
    [onToast]
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            zIndex: 1000,
            background: 'white',
            padding: '6px 10px',
            borderRadius: '20px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <div
            style={{
              width: '14px',
              height: '14px',
              border: '2px solid #3b82f6',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite'
            }}
          />
          <span style={{ fontSize: '11px', fontWeight: '500', color: '#374151' }}>Loading…</span>
        </div>
      )}

      <div
        role="group"
        aria-label="Legend"
        style={{
          position: 'absolute',
          bottom: '10px',
          right: '10px',
          zIndex: 1000,
          background: 'white',
          padding: '8px',
          borderRadius: '6px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          fontSize: '11px'
        }}
      >
        <div style={{ fontWeight: '600', marginBottom: '6px', color: '#1f2937' }}>Legend</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <div style={{ width: '12px', height: '12px', background: '#3b82f6', borderRadius: '50%' }} />
          <span>Charging stations</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', background: '#9333ea', transform: 'rotate(45deg)', border: '1px solid white' }} />
          <span>Council markers</span>
        </div>
      </div>

      <MapContainer
        ref={mapRef}
        center={[54.5, -4]}
        zoom={6}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
        scrollWheelZoom
        bounds={[[-8.649, 49.823], [1.763, 60.845]]}
      >
        <MapInitializer />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={process.env.NEXT_PUBLIC_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
          maxZoom={19}
        />

        <ViewportFetcher
          onFetchStations={onFetchStations}
          onLoadingChange={onLoadingChange}
          searchResult={searchResult}
          shouldZoomToData={shouldZoomToData}
          stations={stationsNormalized}
          /* NEW */
          showCouncil={showCouncil}
          councilBBox={councilBBox}
        />

        {showHeatmap && <HeatmapLayer stations={stationsNormalized} />}

        {showMarkers && (
          <MarkerClusterGroup chunkedLoading>
            {stationsNormalized.map((station) => (
              <StationMarker key={station.id} station={station} onClick={handleStationClick} />
            ))}
          </MarkerClusterGroup>
        )}

        {/* NEW: council polygons overlay (click → code+bbox) */}
        <CouncilBoundaryLayer
          showCouncil={showCouncil}
          onSelect={onCouncilSelect}
          onBBox={onCouncilBBox}
        />

        {/* Existing: council “station-like” markers */}
        <CouncilMarkerLayer showCouncil={showCouncil} onMarkerClick={handleStationClick} />

        <UserLocationMarker location={userLocation} accuracy={locationAccuracy} />
        <LocateMeControl onLocationChange={handleLocationChange} onError={handleLocationError} />
      </MapContainer>

      <StationDrawer
        station={activeStation}
        onClose={handleDrawerClose}
        onFeedbackSubmit={handleFeedbackSubmit}
      />

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
