'use client';

interface Station {
  id: string;
  name?: string;
  address?: string;
  latitude: number;
  longitude: number;
  connectors?: number;
  powerKW?: number;
  network?: string;
  cost?: string;
}

interface StationPopupProps {
  station: Station;
}

export default function StationPopup({ station }: StationPopupProps) {
  const openDirections = (provider: 'google' | 'apple' | 'osm') => {
    const { latitude, longitude } = station;
    const urls = {
      google: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
      apple: `https://maps.apple.com/?daddr=${latitude},${longitude}`,
      osm: `https://www.openstreetmap.org/directions?to=${latitude},${longitude}`,
    };
    window.open(urls[provider], '_blank');
  };

  const copyAddress = () => {
    if (station.address) {
      navigator.clipboard.writeText(station.address);
      alert('Address copied!');
    }
  };

  const openOCM = () => {
    window.open(`https://openchargemap.org/site/poi/details/${station.id}`, '_blank');
  };

  return (
    <div className="min-w-[250px]">
      <h3 className="font-bold text-base mb-2">{station.name || 'Charging Station'}</h3>
      
      {station.address && (
        <p className="text-xs text-gray-600 mb-2">{station.address}</p>
      )}

      <div className="space-y-1 mb-3 text-xs">
        {station.connectors && (
          <p><strong>Connectors:</strong> {station.connectors}</p>
        )}
        {station.powerKW && (
          <p><strong>Power:</strong> {station.powerKW} kW</p>
        )}
        {station.network && (
          <p><strong>Network:</strong> {station.network}</p>
        )}
        {station.cost && (
          <p><strong>Cost:</strong> {station.cost}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => openDirections('google')}
            className="flex-1 px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
          >
            📍 Google Maps
          </button>
          <button
            onClick={() => openDirections('apple')}
            className="flex-1 px-2 py-1 bg-gray-600 text-white rounded text-xs font-medium hover:bg-gray-700"
          >
            🍎 Apple Maps
          </button>
        </div>
        
        <div className="flex gap-2">
          {station.address && (
            <button
              onClick={copyAddress}
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50"
            >
              📋 Copy Address
            </button>
          )}
          <button
            onClick={openOCM}
            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50"
          >
            🔗 Open in OCM
          </button>
        </div>
      </div>
    </div>
  );
}
