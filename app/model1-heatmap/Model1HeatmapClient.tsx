"use client";
import { useEffect, useState } from 'react';
import ClientMap from '../../components/Map/ClientMap';
import ToggleBar from '../../components/ui/ToggleBar';
import Toast from '../../components/ui/Toast';
import SearchControl from '../../components/Map/SearchControl';
import { Station } from '../../lib/stations/types';

const COUNCIL_URL = '/data/councils-london.geo.json';
const STATIONS_URL = '/api/stations';

export default function Model1HeatmapClient() {
  const [stations, setStations] = useState<Station[]>([]);
  const [source, setSource] = useState('DEMO');
  const [councilGeoJson, setCouncilGeoJson] = useState<any>(null);
  const [showCouncil, setShowCouncil] = useState(false);
  const [toast, setToast] = useState('');
  const [bounds, setBounds] = useState<[[number, number], [number, number]]>([[51.49, -0.15], [51.52, -0.07]]);

  useEffect(() => {
    fetch(STATIONS_URL)
      .then(res => res.json())
      .then(data => {
        setStations(data.items || []);
        setSource(data.source || 'DEMO');
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
      <div className="p-2 flex gap-2 items-center">
        <SearchControl onSearch={handleSearch} />
        <ToggleBar toggles={[{ label: 'Council', value: 'council' }]} onToggle={handleToggleCouncil} active={showCouncil ? 'council' : ''} />
        <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={handleZoomToData}>Zoom to data</button>
        <span className="ml-4 text-xs bg-gray-200 px-2 py-1 rounded">Stations: {stations.length}</span>
        <span className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded cursor-pointer" title="Debug" onClick={() => setToast(`Source: ${source}, Count: ${stations.length}, Coords: ${stations[0]?.lat},${stations[0]?.lng}`)}>?</span>
      </div>
      <div className="flex-1">
        <ClientMap
          stations={stations}
          bounds={bounds}
          councilGeoJson={councilGeoJson}
          showCouncil={showCouncil}
          onZoomToData={handleZoomToData}
        />
      </div>
      <Toast message={toast} show={!!toast} onClose={() => setToast('')} />
    </div>
  );
}
