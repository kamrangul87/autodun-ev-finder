"use client";
import { useEffect, useState } from 'react';
import ClientMap from '../../components/Map/ClientMap';
// TopBar UI inline (no external file)
import Toast from '../../components/ui/Toast';
import SearchControl from '../../components/Map/SearchControl';
import { Station } from '../../lib/stations/types';
import { ensureLeafletIconFix } from '../../lib/leafletIconFix';

const COUNCIL_URL = '/api/councils';
const STATIONS_URL = '/api/stations';

export default function Model1HeatmapClient() {
  const [stations, setStations] = useState<Station[]>([]);
  const [councilGeoJson, setCouncilGeoJson] = useState<any>(null);
  const [showCouncil, setShowCouncil] = useState(false);
  const [heatOn, setHeatOn] = useState(true);
  const [markersOn, setMarkersOn] = useState(true);
  const [bounds, setBounds] = useState<[[number, number], [number, number]]>([[51.49, -0.15], [51.52, -0.07]]);
  const [toast, setToast] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  useEffect(() => {
    ensureLeafletIconFix();
    // Set real viewport height for mobile
    const setVh = () => {
      document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    };
    setVh();
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);
    return () => {
      window.removeEventListener('resize', setVh);
      window.removeEventListener('orientationchange', setVh);
    };
  }, []);

  useEffect(() => {
    fetch(STATIONS_URL)
      .then(res => res.json())
      .then(data => {
        setStations(data.items || []);
        if (data.items && data.items.length) {
          const lats = data.items.map((s: Station) => s.lat);
          const lngs = data.items.map((s: Station) => s.lng);
          setBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]);
        }
      });
  }, []);

  function handleZoomToData() {
    if (stations.length) {
      const lats = stations.map(s => s.lat);
      const lngs = stations.map(s => s.lng);
      setBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]);
      setToast('Zoomed to data');
    }
  }

  function handleToggleCouncil() {
    setShowCouncil(v => !v);
    if (!councilGeoJson) {
      fetch(COUNCIL_URL).then(res => res.json()).then(setCouncilGeoJson);
    }
  }

  function handleSearch(lat: number, lng: number) {
    setBounds([[lat - 0.01, lng - 0.01], [lat + 0.01, lng + 0.01]]);
    setToast('Map centered');
  }

  return (
    <div className="h-screen w-full flex flex-col">
      {/* Sticky TopBar UI */}
      <div className="sticky top-0 z-50 bg-white/90 shadow flex flex-col md:flex-row md:items-center gap-2 px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg text-blue-900">autodun</span>
        </div>
        <div className="flex-1 flex items-center gap-2">
          <SearchControl onSearch={handleSearch} />
          <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={handleZoomToData}>Zoom to data</button>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={heatOn} onChange={e => setHeatOn(e.target.checked)} />
            <span className="text-sm">Heatmap</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={markersOn} onChange={e => setMarkersOn(e.target.checked)} />
            <span className="text-sm">Markers</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={showCouncil} onChange={handleToggleCouncil} />
            <span className="text-sm">Council</span>
          </label>
          <button className="px-2 py-1 bg-amber-500 text-white rounded" onClick={() => setFeedbackOpen(true)}>Feedback</button>
        </div>
      </div>
      <div className="flex-1 relative" style={{ minHeight: 'calc(var(--vh, 1vh) * 100 - 56px)' }}>
        <ClientMap
          bounds={bounds}
          councilGeoJson={councilGeoJson}
          showCouncil={showCouncil}
          heatOn={heatOn}
          markersOn={markersOn}
          onZoomToData={handleZoomToData}
        />
      </div>
      {feedbackOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-2">Feedback</h2>
            <textarea
              className="w-full border rounded p-2 mb-3"
              rows={3}
              value={feedbackMsg}
              onChange={e => setFeedbackMsg(e.target.value)}
              placeholder="Your feedback..."
              disabled={feedbackLoading}
            />
            <div className="flex gap-2 justify-end">
              <button className="px-3 py-1 rounded bg-gray-200" onClick={() => setFeedbackOpen(false)} disabled={feedbackLoading}>Cancel</button>
              <button
                className="px-4 py-1 rounded bg-amber-500 text-white font-semibold"
                disabled={feedbackLoading || !feedbackMsg.trim()}
                onClick={async () => {
                  setFeedbackLoading(true);
                  try {
                    const res = await fetch('/api/feedback', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ stationId: 'ui', vote: 'good', message: feedbackMsg }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                      setToast('Feedback sent!');
                      setFeedbackOpen(false);
                      setFeedbackMsg('');
                    } else {
                      setToast('Error sending feedback');
                    }
                  } catch {
                    setToast('Error sending feedback');
                  } finally {
                    setFeedbackLoading(false);
                  }
                }}
              >Send</button>
            </div>
          </div>
        </div>
      )}
      <Toast message={toast} show={!!toast} onClose={() => setToast('')} />
    </div>
  );
}
