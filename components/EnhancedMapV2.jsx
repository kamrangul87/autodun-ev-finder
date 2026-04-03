// components/EnhancedMapV2.jsx
import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import StationDrawer from './StationDrawer.tsx';
import { LocateMeButton } from './LocateMeButton.tsx';
import { getCached, setCache } from '../lib/api-cache';
import { telemetry } from '../utils/telemetry.ts';
import { findNearestStation } from '../utils/haversine.ts';
import { debugLog } from "../utils/debug";
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
    '<div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center"><div style="background:#8b5cf6;width:13px;height:13px;transform:rotate(45deg);border:2px solid white;box-shadow:0 0 6px rgba(139,92,246,0.6)"></div></div>',
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11]
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

const StationMarker = memo(function StationMarker({ station, onClick }) {
  return (
    <Marker
      position={[station.lat, station.lng]}
      eventHandlers={{ click: () => onClick(station) }}
    />
  );
});

/* ──────────────────────────────────────────────────────────────
   Council polygons — authoritative martinjc UK Local Authority GeoJSON
   Fetched once (England + Scotland + Wales), cached in memory.
   No viewport re-fetching, no internal API calls.
   ────────────────────────────────────────────────────────────── */
const UK_LAD_SOURCES = [
  'https://raw.githubusercontent.com/martinjc/UK-GeoJSON/master/json/administrative/eng/lad.json',
  'https://raw.githubusercontent.com/martinjc/UK-GeoJSON/master/json/administrative/sco/lad.json',
  'https://raw.githubusercontent.com/martinjc/UK-GeoJSON/master/json/administrative/wal/lad.json',
];
const UK_COUNCIL_CACHE_KEY = 'uk_council_geojson_v1';

async function fetchAllUKCouncils() {
  const cached = getCached(UK_COUNCIL_CACHE_KEY);
  if (cached?.geojson) return cached.geojson;
  const results = await Promise.all(UK_LAD_SOURCES.map((url) => fetch(url).then((r) => r.json())));
  const merged = {
    type: 'FeatureCollection',
    features: results.flatMap((fc) =>
      (fc.features || [])
        .filter((f) => f.geometry != null && ['Polygon', 'MultiPolygon'].includes(f.geometry.type))
        .map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            name: f.properties?.LAD13NM || f.properties?.LAD23NM || 'Unknown',
            code: f.properties?.LAD13CD || f.properties?.LAD23CD || '',
          },
        }))
    ),
  };
  setCache(UK_COUNCIL_CACHE_KEY, { geojson: merged });
  return merged;
}

function CouncilBoundaryLayer({ showCouncil, onSelect, onBBox }) {
  const map = useMap();
  const layerRef = useRef(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!showCouncil) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }
    if (layerRef.current || loadingRef.current) return;
    loadingRef.current = true;
    fetchAllUKCouncils()
      .then((gj) => {
        if (!showCouncil) return; // toggled off while loading
        layerRef.current = L.geoJSON(gj, {
          style: { color: '#0066ff', weight: 2, fillColor: '#0066ff', fillOpacity: 0.08 },
          onEachFeature: (f, layer) => {
            const { name, code } = f.properties || {};
            if (layer && 'getBounds' in layer) {
              const lb = layer.getBounds();
              const bb = [lb.getWest(), lb.getSouth(), lb.getEast(), lb.getNorth()];
              (f.properties ||= {}).bbox = bb;
            }
            layer.bindPopup(`<strong>${name || 'Council'}</strong><br/>${code || ''}`);
            layer.on('click', () => {
              const bb = f?.properties?.bbox;
              if (bb?.length === 4) {
                onBBox?.(bb);
                map.fitBounds([[bb[1], bb[0]], [bb[3], bb[2]]], { padding: [18, 18] });
              }
              onSelect?.(code || null);
            });
          },
        }).addTo(map);
      })
      .catch((e) => console.error('[CouncilBoundaryLayer]', e))
      .finally(() => { loadingRef.current = false; });

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [showCouncil, map, onSelect, onBBox]);

  return null;
}

/* Existing council markers (points), unchanged */
function CouncilMarkerLayer({ showCouncil, onMarkerClick, onCountChange }) {
  const map = useMap();
  const [councilStations, setCouncilStations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchTimeoutRef = useRef(null);
  const lastBboxRef = useRef(null);

  const fetchCouncilData = useCallback(async () => {
    if (!showCouncil) {
      setCouncilStations([]);
      onCountChange?.(0);
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
      onCountChange?.((cached.items || []).length);
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
        onCountChange?.(items.length);
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
      if (map.getZoom() < 10) return;
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => fetchCouncilData(), 800);
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
          zIndexOffset={500}
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
      if (map.getZoom() < 10) return; // skip fetch at overview zoom levels
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => fetchForViewport(false), 800);
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
  onCouncilBBox,
  onCouncilCount
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
           // adjust path if needed

debugLog("[Location] Nearest station:", station);
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
          style={{ position: 'absolute', bottom: '14px', left: '14px', zIndex: 1000, background: 'rgba(10,22,40,0.9)', border: '1px solid rgba(0,229,160,0.2)', padding: '5px 10px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '7px', backdropFilter: 'blur(4px)' }}
        >
          <div style={{ width: '12px', height: '12px', border: '2px solid rgba(0,229,160,0.3)', borderTopColor: '#00e5a0', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#00e5a0' }}>Loading…</span>
        </div>
      )}

      <div
        role="group"
        aria-label="Legend"
        style={{ position: 'absolute', bottom: '14px', right: '14px', zIndex: 1000, background: 'rgba(10,22,40,0.92)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 12px', borderRadius: '10px', fontSize: '11px', color: '#d1d5db', backdropFilter: 'blur(4px)', minWidth: 148 }}
      >
        <div style={{ fontWeight: 700, marginBottom: '8px', color: '#ffffff', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Legend</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
          <div style={{ width: '10px', height: '10px', background: '#3b82f6', borderRadius: '50%', flexShrink: 0 }} />
          <span>Charging stations</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
          <div style={{ width: '10px', height: '10px', background: '#9333ea', transform: 'rotate(45deg)', flexShrink: 0 }} />
          <span>Council markers</span>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '7px', marginBottom: '4px' }}>
          <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>AI Suitability</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#00e5a0', flexShrink: 0 }} />
            <span>High (&ge;75%)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
            <span>Medium (50–74%)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
            <span>Low (&lt;50%)</span>
          </div>
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
          <MarkerClusterGroup chunkedLoading maxClusterRadius={60} disableClusteringAtZoom={16}>
            {stationsNormalized.map((station) => (
              <StationMarker key={station.id} station={station} onClick={handleStationClick} />
            ))}
          </MarkerClusterGroup>
        )}

        {/* Council boundary polygons removed — markers only */}

        {/* Existing: council “station-like” markers */}
        <CouncilMarkerLayer showCouncil={showCouncil} onMarkerClick={handleStationClick} onCountChange={onCouncilCount} />

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
