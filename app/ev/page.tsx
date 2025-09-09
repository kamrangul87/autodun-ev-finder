'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';

// Load the map only on the client
const Map = dynamic(() => import('@/components/Map'), { ssr: false });

// Very light type to match what /api/stations returns
type Station = {
  ID: number;
  _score?: number;
  _distanceKm?: number;
  AddressInfo?: {
    Title?: string | null;
    AddressLine1?: string | null;
    Town?: string | null;
    Postcode?: string | null;
    Latitude?: number | null;
    Longitude?: number | null;
    ContactTelephone1?: string | null;
    RelatedURL?: string | null;
  } | null;
  Connections?: Array<{
    PowerKW?: number | null;
    ConnectionType?: { Title?: string | null; FormalName?: string | null } | null;
  }> | null;
};

export default function EVFinder() {
  // UI state
  const [postcode, setPostcode] = useState('SW1A 1AA');
  const [lat, setLat] = useState<number | null>(51.5014);
  const [lon, setLon] = useState<number | null>(-0.1419);
  const [dist, setDist] = useState<number>(10);          // km radius
  const [minPower, setMinPower] = useState<number>(0);   // kW
  const [conn, setConn] = useState<string>('');          // '', 'CCS', 'Type 2', 'CHAdeMO'
  const [loading, setLoading] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);

  // Geocode a postcode/place name to lat/lon
  async function geocode(q: string) {
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`Geocode ${r.status}`);
      const j = await r.json();
      if (Array.isArray(j) && j.length) {
        setLat(parseFloat(j[0].lat));
        setLon(parseFloat(j[0].lon));
      } else {
        alert('Place/postcode not found');
      }
    } catch (e) {
      console.error(e);
      alert('Unable to search that location right now.');
    }
  }

  // Load stations from our API
  async function loadStations() {
    if (lat == null || lon == null) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        dist: String(dist),
        minPower: String(minPower),
      });
      if (conn) params.set('conn', conn); // omit when “Any”

      const r = await fetch(`/api/stations?${params.toString()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`API ${r.status}`);

      const j = await r.json().catch(() => []);
      setStations(Array.isArray(j) ? j : []);
    } catch (e) {
      console.error(e);
      setStations([]);
    } finally {
      setLoading(false);
    }
  }

  // Auto-reload when filters/location change
  useEffect(() => {
    loadStations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, dist, minPower, conn]);

  // Use browser geolocation
  function useMyLocation() {
    if (!navigator.geolocation) return alert('Geolocation not supported');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLon(pos.coords.longitude);
      },
      () => alert('Unable to get your location')
    );
  }

  // Map center (only when we have both)
  const center: [number, number] | null = useMemo(
    () => (lat != null && lon != null ? ([lat, lon] as [number, number]) : null),
    [lat, lon]
  );

  // Safety: always render with a real array
  const safeStations = Array.isArray(stations) ? stations : [];

  return (
    <div className="container py-10">
      <h1 className="text-3xl font-extrabold mb-1">EV Charging Finder</h1>
      <p className="text-sm text-gray-500 mb-4">
        Search by UK postcode or use your location.
      </p>

      {/* Top search row */}
      <div className="grid md:grid-cols-[2fr_1fr_1fr_1fr] gap-3">
        <input
          className="card"
          placeholder="Enter UK postcode or place (e.g., SW1A 1AA)"
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
        />
        <button className="btn bg-black text-white" onClick={() => geocode(postcode)}>
          Search
        </button>
        <button className="btn bg-autodun-green text-white" onClick={useMyLocation}>
          Use my location
        </button>
        <button className="btn bg-white border" onClick={loadStations}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mt-4">
        {/* Filters */}
        <div className="card">
          <h3 className="font-bold mb-2">Filters</h3>

          <label className="block text-sm mb-1">Distance (km)</label>
          <input
            type="number"
            className="w-full border rounded-xl p-2 mb-3"
            value={dist}
            onChange={(e) => setDist(Math.max(1, Number(e.target.value) || 1))}
          />

          <label className="block text-sm mb-1">Min Power (kW)</label>
          <input
            type="number"
            className="w-full border rounded-xl p-2 mb-3"
            value={minPower}
            onChange={(e) => setMinPower(Math.max(0, Number(e.target.value) || 0))}
          />

          <label className="block text-sm mb-1">Connector</label>
          <select
            className="w-full border rounded-xl p-2"
            value={conn}
            onChange={(e) => setConn(e.target.value)}
          >
            <option value="">Any</option>
            <option value="CCS">CCS</option>
            <option value="Type 2">Type 2</option>
            <option value="CHAdeMO">CHAdeMO</option>
          </select>

          <p className="text-xs text-gray-500 mt-3">
            Tip: Set 43+ kW for rapid DC charging.
          </p>
        </div>

        {/* Map + Results */}
        <div className="md:col-span-3">
          <div className="card p-0 overflow-hidden">
            {center ? (
              <Map center={center} stations={safeStations} />
            ) : (
              <div className="p-6">Enter a postcode or use your location.</div>
            )}
          </div>

          <div className="mt-4 card">
            <h3 className="font-bold text-lg mb-2">
              Results ({safeStations.length})
            </h3>
            <ul className="divide-y">
              {safeStations.map((s) => (
                <li key={s.ID} className="py-3">
                  <p className="font-semibold flex items-center gap-2">
                    {s.AddressInfo?.Title}
                    {typeof s._score === 'number' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 border">
                        Score {s._score}
                      </span>
                    )}
                    {typeof s._distanceKm === 'number' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 border">
                        {s._distanceKm} km
                      </span>
                    )}
                  </p>

                  <p className="text-sm text-gray-600">
                    {[
                      s.AddressInfo?.AddressLine1,
                      s.AddressInfo?.Town,
                      s.AddressInfo?.Postcode,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>

                  <p className="text-sm mt-1">
                    {(s.Connections ?? []).map((c, i) => (
                      <span key={i} className="badge mr-2 mb-1">
                        {(c.ConnectionType?.FormalName ||
                          c.ConnectionType?.Title ||
                          'Connector') +
                          (c.PowerKW ? ` • ${c.PowerKW}kW` : '')}
                      </span>
                    ))}
                  </p>

                  {s.AddressInfo?.ContactTelephone1 ? (
                    <p className="text-sm text-gray-600 mt-1">
                      Tel: {s.AddressInfo.ContactTelephone1}
                    </p>
                  ) : null}

                  {s.AddressInfo?.RelatedURL ? (
                    <a
                      className="text-sm text-blue-600 underline"
                      href={s.AddressInfo.RelatedURL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      More info
                    </a>
                  ) : null}
                </li>
              ))}

              {safeStations.length === 0 && !loading && (
                <li className="py-3 text-gray-600">
                  No chargers found with current filters.
                </li>
              )}
              {loading && (
                <li className="py-3 text-gray-600">Loading…</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
