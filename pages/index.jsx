// pages/index.jsx - HOTFIX (with AI heatmap wiring)
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { searchLocation } from '../lib/postcode-search';
import { getInitialState, updateURL } from '../utils/url-state';

const EnhancedMap = dynamic(() => import('../components/EnhancedMapV2'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: '100%',
        height: '500px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f3f4f6',
      }}
    >
      <p>Loading map...</p>
    </div>
  ),
});

export default function Home() {
  const [stations, setStations] = useState([]);
  const [dataSource, setDataSource] = useState('DEMO');
  const [fellBack, setFellBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [state, setState] = useState({
    heat: false,
    markers: true,
    council: false,
    query: '',
  });
  const [searchResult, setSearchResult] = useState(null);
  const [shouldZoomToData, setShouldZoomToData] = useState(false);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState(null);
  const [regionName, setRegionName] = useState('United Kingdom');
  const [initialDataReady, setInitialDataReady] = useState(false);
  const hasLoadedRef = useRef(false);

  // 🔹 AI scores map state (used by EnhancedMap heat layer)
  const [aiScoresById, setAiScoresById] = useState({});

  useEffect(() => {
    setState(getInitialState());
  }, []);

  const handleFetchStations = useCallback((data) => {
    if (!data) return;
    setStations(data.items || []);
    setDataSource(data.source || 'DEMO');
    setFellBack(data.fellBack || false);
    setError(null);
  }, []);

  useEffect(() => {
    if (hasLoadedRef.current) return;

    const fetchInitialUKData = async () => {
      try {
        setLoading(true);
        const bboxStr = `-8.649,49.823,1.763,60.845`;
        const url = `/api/stations?bbox=${bboxStr}&tiles=4&limitPerTile=500`;
        const response = await fetch(url, { cache: 'no-store' });
        const data = await response.json();

        if (response.ok) {
          const normalizedData = {
            items: data.features ? data.features.map((f) => f.properties) : [],
            count: data.count,
            source: data.source,
            bbox: data.bbox,
          };
          setStations(normalizedData.items || []);
          setDataSource(normalizedData.source || 'DEMO');
          setFellBack(normalizedData.fellBack || false);
          setError(null);

          if (normalizedData.items.length > 0) {
            setInitialDataReady(true);
            hasLoadedRef.current = true;
          }
        }
      } catch (error) {
        console.error('Initial UK data fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialUKData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const manualRefresh = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stations');
      const data = await response.json();
      if (response.ok) {
        handleFetchStations(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    updateURL(state, true);
  }, [state]);

  const toggleHeat = () => setState((s) => ({ ...s, heat: !s.heat }));
  const toggleMarkers = () => setState((s) => ({ ...s, markers: !s.markers }));
  const toggleCouncil = () => setState((s) => ({ ...s, council: !s.council }));

  const showToast = (toast) => {
    const message = typeof toast === 'string' ? toast : toast.message;
    const type = typeof toast === 'object' ? toast.type : 'info';
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSearch = async () => {
    if (!state.query.trim()) return;
    setSearching(true);
    try {
      const result = await searchLocation(state.query);
      setSearchResult(result);
      if (result.regionName) {
        setRegionName(result.regionName);
      }
    } catch (err) {
      showToast(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleZoomToData = () => {
    setShouldZoomToData((prev) => !prev);
    setTimeout(() => setShouldZoomToData(false), 500);
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      showToast('Geolocation not supported on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // Trigger location found which will center the map
        setState((s) => ({
          ...s,
          userLocation: { lat: latitude, lng: longitude },
        }));
        showToast('Location found!');
      },
      (err) => {
        console.warn('Geolocation error:', err);
        showToast('Could not get your location. Please check permissions.');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  // 🔹 StationDrawer will call this after scoring. We update the shared
  //     aiScoresById map so the heatmap reweights immediately.
  const handleAiScore = useCallback((stationId, score) => {
    setAiScoresById((prev) => {
      if (prev[stationId] === score) return prev;
      return { ...prev, [stationId]: score };
    });
  }, []);

  const heatCount = state.heat ? stations.length : 0;
  const markerCount = state.markers ? stations.length : 0;
  const councilCount = state.council ? '∞' : 0;

  return (
    <>
      <Head>
        <title>Autodun EV Finder - Find Charging Stations</title>
        <meta
          name="description"
          content="Find electric vehicle charging stations in the UK"
        />
      </Head>
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        <header
          style={{
            padding: '1rem',
            background: '#1f2937',
            color: 'white',
            borderBottom: '2px solid #3b82f6',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>⚡ Autodun EV Finder</h1>
        </header>
        <div
          className="controls-container"
          style={{
            padding: '1rem',
            background: '#f3f4f6',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', flex: '1 1 300px' }}>
            <input
              type="text"
              placeholder="Enter UK postcode (e.g., SW1A 1AA)"
              value={state.query}
              onChange={(e) =>
                setState((s) => ({ ...s, query: e.target.value }))
              }
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              style={{
                flex: 1,
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                minHeight: '40px',
              }}
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              style={{
                padding: '0.75rem 1rem',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: searching ? 'wait' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                minHeight: '40px',
              }}
            >
              {searching ? 'Searching...' : 'Go'}
            </button>
          </div>
          <div
            className="toggle-group"
            style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                minHeight: '40px',
              }}
            >
              <input
                type="checkbox"
                checked={state.heat}
                onChange={toggleHeat}
                style={{ width: '20px', height: '20px' }}
              />
              <span>Heatmap ({heatCount})</span>
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                minHeight: '40px',
              }}
            >
              <input
                type="checkbox"
                checked={state.markers}
                onChange={toggleMarkers}
                style={{ width: '20px', height: '20px' }}
              />
              <span>Markers ({markerCount})</span>
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                minHeight: '40px',
              }}
            >
              <input
                type="checkbox"
                checked={state.council}
                onChange={toggleCouncil}
                style={{ width: '20px', height: '20px' }}
              />
              <span>Council ({councilCount})</span>
            </label>
          </div>
          <div className="action-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleZoomToData}
              style={{
                padding: '0.75rem 1rem',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                minHeight: '40px',
              }}
            >
              Zoom to data
            </button>
            <button
              onClick={handleLocateMe}
              style={{
                padding: '0.75rem 1rem',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                minHeight: '40px',
              }}
            >
              📍 Locate me
            </button>
            <button
              onClick={manualRefresh}
              disabled={loading}
              style={{
                padding: '0.75rem 1rem',
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: loading ? 'wait' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                minHeight: '40px',
              }}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          <style jsx>{`
            @media (max-width: 375px) {
              .controls-container {
                padding: 0.75rem !important;
                gap: 0.75rem !important;
              }
              .toggle-group {
                width: 100%;
                justify-content: space-between;
              }
              .action-buttons {
                width: 100%;
              }
              .action-buttons button {
                flex: 1;
              }
            }
          `}</style>
        </div>
        <div
          style={{
            padding: '0.5rem 1rem',
            background: '#e5e7eb',
            fontSize: '0.75rem',
            color: '#374151',
          }}
        >
          <strong>Source:</strong>{' '}
          {dataSource === 'OPENCHARGE' ? 'OPENCHARGE (live)' : dataSource} •{' '}
          <strong>Stations:</strong> {stations.length} • <strong>Bounds:</strong>{' '}
          {regionName}
        </div>
        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              background: '#fef2f2',
              color: '#dc2626',
              fontSize: '0.875rem',
              borderBottom: '1px solid #fecaca',
            }}
          >
            ⚠️ {error}
          </div>
        )}
        {toast && (
          <div
            style={{
              position: 'fixed',
              top: '6rem',
              left: '50%',
              transform: 'translateX(-50%)',
              background:
                toast.type === 'error'
                  ? '#dc2626'
                  : toast.type === 'success'
                  ? '#10b981'
                  : '#1f2937',
              color: 'white',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              zIndex: 10001,
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            }}
          >
            {toast.message}
          </div>
        )}
        <div
          style={{ flex: 1, width: '100%', minHeight: '500px', position: 'relative' }}
        >
          {initialDataReady ? (
            <EnhancedMap
              stations={stations}
              showHeatmap={state.heat}
              showMarkers={state.markers}
              showCouncil={state.council}
              searchResult={searchResult}
              shouldZoomToData={shouldZoomToData}
              userLocation={state.userLocation}
              onFetchStations={handleFetchStations}
              onLoadingChange={setLoading}
              onToast={showToast}
              isLoading={loading}
              // 🔹 pass AI score state & callback so heatmap reweights
              aiScoresById={aiScoresById}
              onAiScore={handleAiScore}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f3f4f6',
              }}
            >
              <p>Loading UK stations...</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
