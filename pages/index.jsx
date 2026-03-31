import Link from "next/link";
// pages/index.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { searchLocation } from '../lib/postcode-search';
import { getInitialState, updateURL } from '../utils/url-state';

const EnhancedMap = dynamic(() => import('../components/EnhancedMapV2'), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1628' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
        <div className="spin-ring" />
        <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>Loading map…</p>
      </div>
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

  const [councilCode, setCouncilCode] = useState(null);
  const [councilBBox, setCouncilBBox] = useState(null);

  const [searchResult, setSearchResult] = useState(null);
  const [shouldZoomToData, setShouldZoomToData] = useState(false);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState(null);
  const [regionName, setRegionName] = useState('United Kingdom');
  const [initialDataReady, setInitialDataReady] = useState(false);
  const hasLoadedRef = useRef(false);
  const didAutoSearchRef = useRef(false);

  useEffect(() => { setState(getInitialState()); }, []);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const code = p.get('c');
      if (code) setCouncilCode(code);
    } catch {}
  }, []);

  useEffect(() => {
    const u = new URL(window.location.href);
    if (councilCode) u.searchParams.set('c', councilCode);
    else u.searchParams.delete('c');
    window.history.replaceState(null, '', u.toString());
  }, [councilCode]);

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
      if (response.ok) handleFetchStations(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { updateURL(state, true); }, [state]);

  const toggleHeat    = () => setState((s) => ({ ...s, heat:    !s.heat    }));
  const toggleMarkers = () => setState((s) => ({ ...s, markers: !s.markers }));
  const toggleCouncil = () => setState((s) => ({ ...s, council: !s.council }));

  const showToast = (toast) => {
    const message = typeof toast === 'string' ? toast : toast.message;
    const type    = typeof toast === 'object'  ? toast.type : 'info';
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSearch = async () => {
    if (!state.query.trim()) return;
    setSearching(true);
    try {
      const result = await searchLocation(state.query);
      setSearchResult(result);
      if (result.regionName) setRegionName(result.regionName);
    } catch (err) {
      showToast(err.message);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (didAutoSearchRef.current) return;
    let postcode = null;
    try {
      const p = new URLSearchParams(window.location.search);
      postcode = p.get('postcode');
    } catch {}
    if (!postcode) return;
    const cleaned = String(postcode).trim();
    if (!cleaned) return;
    didAutoSearchRef.current = true;
    setState((s) => ({ ...s, query: cleaned }));
    setTimeout(() => {
      try {
        if (cleaned) {
          setSearching(true);
          searchLocation(cleaned)
            .then((result) => { setSearchResult(result); if (result?.regionName) setRegionName(result.regionName); })
            .catch((err) => showToast(err?.message || 'Search failed'))
            .finally(() => setSearching(false));
        }
      } catch {}
    }, 0);
  }, []);

  const handleZoomToData = () => {
    setShouldZoomToData((prev) => !prev);
    setTimeout(() => setShouldZoomToData(false), 500);
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) { showToast('Geolocation not supported on this device.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setState((s) => ({ ...s, userLocation: { lat: latitude, lng: longitude } }));
        showToast('Location found!');
      },
      (err) => { console.warn('Geolocation error:', err); showToast('Could not get your location. Please check permissions.'); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const heatCount    = state.heat    ? stations.length : 0;
  const markerCount  = state.markers ? stations.length : 0;
  const councilCount = state.council ? stations.length : 0;

  const sourceLabel = loading
    ? 'Loading stations…'
    : dataSource === 'OPENCHARGE' ? 'OPENCHARGE (live)' : dataSource;

  /* ── pill button base style ── */
  const pill = (active, accentBg, accentText) => ({
    padding: '0.4rem 0.8rem',
    background: active ? accentBg : 'rgba(255,255,255,0.06)',
    color: active ? accentText : '#9ca3af',
    border: `1px solid ${active ? accentBg : 'rgba(255,255,255,0.1)'}`,
    borderRadius: '2rem',
    fontSize: '0.775rem',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s ease',
    lineHeight: 1.4,
  });

  const actionBtn = {
    padding: '0.4rem 0.75rem',
    background: 'rgba(255,255,255,0.06)',
    color: '#d1d5db',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.775rem',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    transition: 'background 0.15s ease',
  };

  return (
    <>
      <Head>
        <title>Autodun EV Finder - Find EV Charging Stations UK</title>
        <meta name="description" content="Find EV charging stations across the UK. Browse 30,000+ charge points by location, connector type and AI suitability score. Free EV charging map." />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://ev.autodun.com/" />
        <meta property="og:title" content="Autodun EV Finder - Find EV Charging Stations UK" />
        <meta property="og:description" content="Find EV charging stations across the UK. Browse 30,000+ charge points by location, connector type and AI suitability score. Free EV charging map." />
        <meta property="og:url" content="https://ev.autodun.com/" />
        <meta property="og:type" content="website" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#0a1628', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <header style={{ background: '#0a1628', borderBottom: '1px solid rgba(0,229,160,0.15)', padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, minHeight: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>⚡</span>
            <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em' }}>Autodun EV</span>
            <span style={{ color: '#4b5563', fontSize: '0.875rem', fontWeight: 400 }}>Finder</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: loading ? '#f59e0b' : '#00e5a0', display: 'inline-block', boxShadow: loading ? 'none' : '0 0 6px #00e5a0' }} />
            <span style={{ color: loading ? '#f59e0b' : '#00e5a0', fontWeight: 600 }}>{loading ? 'Loading…' : 'Live'}</span>
          </div>
        </header>

        {/* ── Controls ── */}
        <div style={{ background: '#0f1f38', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0.55rem 1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center', flexShrink: 0 }}>

          {/* Search */}
          <div style={{ display: 'flex', gap: '0.4rem', flex: '1 1 200px', minWidth: 0 }}>
            <input
              type="text"
              placeholder="Postcode or town…"
              value={state.query}
              onChange={(e) => setState((s) => ({ ...s, query: e.target.value }))}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              style={{ flex: 1, padding: '0.45rem 0.75rem', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '0.5rem', color: '#ffffff', fontSize: '0.85rem', outline: 'none', minWidth: 0 }}
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              style={{ padding: '0.45rem 1rem', background: searching ? '#065f46' : '#00e5a0', color: '#0a1628', border: 'none', borderRadius: '0.5rem', cursor: searching ? 'wait' : 'pointer', fontSize: '0.85rem', fontWeight: 700, flexShrink: 0 }}
            >
              {searching ? '…' : 'Search'}
            </button>
          </div>

          {/* Layer pills */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button onClick={toggleHeat}    style={pill(state.heat,    '#00e5a0', '#0a1628')}>🔥 Heatmap{state.heat    ? ` (${heatCount})`    : ''}</button>
            <button onClick={toggleMarkers} style={pill(state.markers, '#00e5a0', '#0a1628')}>📍 Stations{state.markers ? ` (${markerCount})` : ''}</button>
            <button onClick={toggleCouncil} style={pill(state.council, '#0066ff', '#ffffff')}>🏛 Council{state.council ? ` (${councilCount})` : ''}</button>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
            <button onClick={handleZoomToData} style={actionBtn}>⤢ Zoom</button>
            <button onClick={handleLocateMe}   style={actionBtn}>📍 Locate</button>
            <button onClick={manualRefresh} disabled={loading} style={{ ...actionBtn, cursor: loading ? 'wait' : 'pointer' }}>
              ↺ {loading ? '…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{ padding: '0.45rem 1.25rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.8rem', borderBottom: '1px solid rgba(239,68,68,0.2)', flexShrink: 0 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Toast ── */}
        {toast && (
          <div style={{ position: 'fixed', top: '5rem', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? '#7f1d1d' : toast.type === 'success' ? '#064e3b' : '#1e2d40', color: 'white', padding: '0.6rem 1.25rem', borderRadius: '0.5rem', fontSize: '0.875rem', zIndex: 10001, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: `1px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.3)' : toast.type === 'success' ? 'rgba(0,229,160,0.3)' : 'rgba(255,255,255,0.1)'}` }}>
            {toast.message}
          </div>
        )}

        {/* ── Map ── */}
        <div style={{ flex: 1, width: '100%', position: 'relative', minHeight: 0 }}>
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
              councilCode={councilCode}
              onCouncilSelect={setCouncilCode}
              councilBBox={councilBBox}
              onCouncilBBox={setCouncilBBox}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a1628', gap: '0.75rem' }}>
              <div className="spin-ring" />
              <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>Loading stations…</p>
            </div>
          )}
        </div>

        {/* ── Status bar ── */}
        <div style={{ background: '#0a1628', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '0.3rem 1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem', alignItems: 'center', fontSize: '0.68rem', color: '#6b7280', flexShrink: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e5a0', display: 'inline-block' }} />
            <span style={{ color: '#00e5a0', fontWeight: 600 }}>{sourceLabel}</span>
          </span>
          <span><span style={{ color: '#6b7280' }}>Stations: </span><span style={{ color: '#d1d5db', fontWeight: 500 }}>{loading ? '…' : stations.length}</span></span>
          <span><span style={{ color: '#6b7280' }}>Bounds: </span><span style={{ color: '#d1d5db', fontWeight: 500 }}>{regionName}</span></span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem' }}>
            <a href="https://openchargemap.org/" target="_blank" rel="noreferrer" style={{ color: '#4b5563', textDecoration: 'none' }}>Data © OCM</a>
            <Link href="/about-ai" style={{ color: '#4b5563', textDecoration: 'none' }}>About AI</Link>
            <Link href="/privacy" style={{ color: '#4b5563', textDecoration: 'none' }}>Privacy</Link>
          </span>
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin-ring {
          width: 36px; height: 36px;
          border: 3px solid rgba(0,229,160,0.2);
          border-top-color: #00e5a0;
          border-radius: 50%;
          animation: spin 0.75s linear infinite;
        }
        input::placeholder { color: rgba(255,255,255,0.3) !important; }
        @media (max-width: 480px) {
          header { padding: 0.5rem 0.75rem !important; }
        }
      `}</style>
    </>
  );
}
