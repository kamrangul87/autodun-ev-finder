// pages/index.jsx - HOTFIX
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { searchLocation } from '../lib/postcode-search';
import { getInitialState, updateURL } from '../utils/url-state';

const Map = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => <div style={{ width: '100%', height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}><p>Loading map...</p></div>
});

export default function Home() {
  const [stations, setStations] = useState([]);
  const [councilData, setCouncilData] = useState(null);
  const [dataSource, setDataSource] = useState('DEMO');
  const [fellBack, setFellBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [state, setState] = useState({ heat: false, markers: true, council: false, query: '' });
  const [searchResult, setSearchResult] = useState(null);
  const [shouldZoomToData, setShouldZoomToData] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => { setState(getInitialState()); }, []);

  const fetchStations = async (lat = null, lng = null, distance = 50) => {
    setLoading(true);
    setError(null);
    try {
      let url = '/api/stations';
      if (lat !== null && lng !== null) {
        url += `?lat=${lat}&lng=${lng}&distance=${distance}`;
      }
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch stations');
      setStations(data.items || []);
      setDataSource(data.source || 'DEMO');
      setFellBack(data.fellBack || false);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
      setStations([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCouncilData = async () => {
    try {
      const response = await fetch('/data/london-councils.geojson');
      if (response.ok) setCouncilData(await response.json());
    } catch (err) {
      console.error('Council data error:', err);
    }
  };

  useEffect(() => { fetchStations(); fetchCouncilData(); }, []);
  useEffect(() => { updateURL(state, true); }, [state]);

  const toggleHeat = () => setState(s => ({ ...s, heat: !s.heat }));
  const toggleMarkers = () => setState(s => ({ ...s, markers: !s.markers }));
  const toggleCouncil = () => setState(s => ({ ...s, council: !s.council }));

  const handleSearch = async () => {
    if (!state.query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const result = await searchLocation(state.query);
      setSearchResult(result);
      // Refetch stations near the searched location
      await fetchStations(result.lat, result.lng, 50);
    } catch (err) {
      setError(`Search failed: ${err.message}`);
    } finally {
      setSearching(false);
    }
  };

  const handleZoomToData = () => {
    setShouldZoomToData(prev => !prev);
    setTimeout(() => setShouldZoomToData(false), 500);
  };

  const heatCount = state.heat ? stations.length : 0;
  const markerCount = state.markers ? stations.length : 0;
  const councilCount = councilData?.features?.length || 0;

  return (
    <>
      <Head>
        <title>Autodun EV Finder - Find Charging Stations</title>
        <meta name="description" content="Find electric vehicle charging stations in the UK" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossOrigin="" />
      </Head>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding: '1rem', background: '#1f2937', color: 'white', borderBottom: '2px solid #3b82f6' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>⚡ Autodun EV Finder</h1>
        </header>
        {(dataSource === 'DEMO' || fellBack) && (
          <div style={{ padding: '0.75rem 1rem', background: '#dc2626', color: 'white', textAlign: 'center', fontSize: '0.875rem', fontWeight: 'bold' }}>
            Using DEMO data ({stations.length} stations)
          </div>
        )}
        <div style={{ padding: '1rem', background: '#f3f4f6', borderBottom: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flex: '1 1 300px' }}>
            <input type="text" placeholder="Enter UK postcode (e.g., SW1A 1AA)" value={state.query} onChange={(e) => setState(s => ({ ...s, query: e.target.value }))} onKeyPress={(e) => e.key === 'Enter' && handleSearch()} style={{ flex: 1, padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.875rem' }} />
            <button onClick={handleSearch} disabled={searching} style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: searching ? 'wait' : 'pointer', fontSize: '0.875rem', fontWeight: '500' }}>{searching ? 'Searching...' : 'Go'}</button>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}><input type="checkbox" checked={state.heat} onChange={toggleHeat} /><span>Heatmap ({heatCount})</span></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}><input type="checkbox" checked={state.markers} onChange={toggleMarkers} /><span>Markers ({markerCount})</span></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}><input type="checkbox" checked={state.council} onChange={toggleCouncil} /><span>Council ({councilCount})</span></label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleZoomToData} style={{ padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500' }}>Zoom to data</button>
            <button onClick={fetchStations} disabled={loading} style={{ padding: '0.5rem 1rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: loading ? 'wait' : 'pointer', fontSize: '0.875rem', fontWeight: '500' }}>{loading ? 'Loading...' : 'Refresh'}</button>
          </div>
        </div>
        <div style={{ padding: '0.5rem 1rem', background: '#e5e7eb', fontSize: '0.75rem', color: '#6b7280' }}>
          <strong>Source:</strong> {dataSource} • <strong>Stations:</strong> {stations.length} • <strong>Center:</strong> London
        </div>
        {error && (
          <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', color: '#dc2626', fontSize: '0.875rem', borderBottom: '1px solid #fecaca' }}>⚠️ {error}</div>
        )}
        <div style={{ flex: 1, width: '100%', minHeight: '500px', position: 'relative' }}>
          {!loading && <Map stations={stations} showHeatmap={state.heat} showMarkers={state.markers} showCouncil={state.council} councilData={councilData} searchResult={searchResult} shouldZoomToData={shouldZoomToData} onFeedback={(id) => console.log('Feedback for:', id)} />}
        </div>
      </div>
    </>
  );
}
