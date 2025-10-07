'use client';

import { useState, useEffect } from 'react';

interface Station {
  id: string;
  name?: string;
  address?: string;
  postcode?: string;
  latitude: number;
  longitude: number;
  connectors?: number;
  powerKW?: number;
  network?: string;
  operator?: string;
  connectorTypes?: string[];
}

interface StationPopupProps {
  station: Station;
}

export default function StationPopup({ station }: StationPopupProps) {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        () => setUserLocation(null)
      );
    }
  }, []);

  const openDirections = (provider: 'google' | 'apple' | 'osm') => {
    const { latitude, longitude } = station;
    const dest = `${latitude},${longitude}`;
    
    const urls: Record<string, string> = {
      google: userLocation 
        ? `https://www.google.com/maps/dir/${userLocation[0]},${userLocation[1]}/${dest}`
        : `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
      apple: userLocation
        ? `https://maps.apple.com/?saddr=${userLocation[0]},${userLocation[1]}&daddr=${dest}`
        : `https://maps.apple.com/?daddr=${dest}`,
      osm: userLocation
        ? `https://www.openstreetmap.org/directions?from=${userLocation[0]},${userLocation[1]}&to=${dest}`
        : `https://www.openstreetmap.org/directions?to=${dest}`,
    };
    
    window.open(urls[provider], '_blank', 'noopener,noreferrer');
  };

  const copyAddress = async () => {
    const text = station.address || `${station.latitude}, ${station.longitude}`;
    try {
      await navigator.clipboard.writeText(text);
      alert('Address copied!');
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  const openOCM = () => {
    window.open(
      `https://openchargemap.org/site/poi/details/${station.id}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const displayName = station.name || station.address?.split(',')[0] || 'Charging Station';
  const connectorSummary = station.connectorTypes?.length
    ? `${station.connectorTypes.join(', ')}`
    : `${station.connectors || 0} connector(s)`;
  const powerInfo = station.powerKW ? ` • ${station.powerKW}kW max` : '';

  return (
    <div className="min-w-[280px] max-w-[320px]" role="dialog" aria-label="Station details">
      <h3 className="font-bold text-base mb-2 text-gray-900">{displayName}</h3>
      
      <div className="space-y-1 mb-3 text-sm text-gray-700">
        {station.address && <p>{station.address}</p>}
        {station.postcode && <p className="font-mono text-xs">{station.postcode}</p>}
        {station.operator && <p className="text-xs"><strong>Operator:</strong> {station.operator}</p>}
        <p className="text-xs text-gray-600">{connectorSummary}{powerInfo}</p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-gray-700 mb-1">Directions:</div>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => openDirections('google')}
            className="px-2 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Open in Google Maps"
          >
            Google
          </button>
          <button
            onClick={() => openDirections('apple')}
            className="px-2 py-1.5 bg-gray-700 text-white rounded text-xs font-medium hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500"
            aria-label="Open in Apple Maps"
          >
            Apple
          </button>
          <button
            onClick={() => openDirections('osm')}
            className="px-2 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            aria-label="Open in OpenStreetMap"
          >
            OSM
          </button>
        </div>
        
        <div className="flex gap-2 pt-1">
          <button
            onClick={copyAddress}
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
            aria-label="Copy address"
          >
            📋 Copy Address
          </button>
          <button
            onClick={openOCM}
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
            aria-label="View on Open Charge Map"
          >
            🔗 OCM
          </button>
        </div>
      </div>
    </div>
  );
}
