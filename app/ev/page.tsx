'use client';

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
const Map = dynamic(() => import('@/components/Map'), { ssr: false });

type Station = any;

export default function EVFinder() {
  const [postcode, setPostcode] = useState('SW1A 1AA');
  const [lat, setLat] = useState<number | null>(51.5014);
  const [lon, setLon] = useState<number | null>(-0.1419);
  const [dist, setDist] = useState<number>(10);
  const [minPower, setMinPower] = useState<number>(0);
  const [conn, setConn] = useState<string>(''); // e.g., CCS, Type 2, CHAdeMO
  const [loading, setLoading] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);

  async function geocode(q: string) {
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    if (Array.isArray(j) && j.length) {
      setLat(parseFloat(j[0].lat));
      setLon(parseFloat(j[0].lon));
    } else {
      alert('Postcode not found');
    }
  }

async function loadStations() {
  if (lat == null || lon == null) return;
  setLoading(true);
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      dist: String(dist),
      minPower: String(minPower),
      conn: conn ?? '', // '' means Any
    });

    const r = await fetch(`/api/stations?${params.toString()}`);
    const j = await r.json();
    setStations(j || []);
  } catch (e) {
    console.error(e);
    setStations([]);
  } finally {
    setLoading(false);
  }
}
  useEffect(() => { loadStations(); }, [lat, lon, dist, minPower, conn]);

  function useMyLocation() {
    if (!navigator.geolocation) return alert('Geolocation not supported');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLon(pos.coords.longitude); },
      () => alert('Unable to get location')
    );
  }

  const center: [number, number] | null = useMemo(() => (lat != null && lon != null ? [lat, lon] as [number, number] : null), [lat, lon]);

  return (
    <>
    <div className="container py-10">
      <h1 className="text-3xl font-extrabold mb-1">EV Charging Finder</h1>
     <p className="text-sm text-gray-500">
  Search by UK postcode or use your location.</p>
      <div className="grid md:grid-cols-[2fr_1fr_1fr_1fr] gap-3">
        <input className="card" placeholder="Enter UK postcode (e.g., SW1A 1AA)" value={postcode} onChange={e => setPostcode(e.target.value)} />
        <button className="btn bg-black text-white" onClick={() => geocode(postcode)}>Search</button>
        <button className="btn bg-autodun-green text-white" onClick={useMyLocation}>Use my location</button>
        <button className="btn bg-white border" onClick={loadStations}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mt-4">
        <div className="card">
          <h3 className="font-bold mb-2">Filters</h3>
          <label className="block text-sm mb-1">Distance (km)</label>
          <input type="number" className="w-full border rounded-xl p-2 mb-3" value={dist} onChange={e => setDist(parseFloat(e.target.value))} />
          <label className="block text-sm mb-1">Min Power (kW)</label>
          <input type="number" className="w-full border rounded-xl p-2 mb-3" value={minPower} onChange={e => setMinPower(parseFloat(e.target.value))} />
          <label className="block text-sm mb-1">Connector</label>
          <select className="w-full border rounded-xl p-2" value={conn} onChange={e => setConn(e.target.value)}>
            <option value="">Any</option>
            <option value="CCS">CCS</option>
            <option value="Type 2">Type 2</option>
            <option value="CHAdeMO">CHAdeMO</option>
          </select>
          <p className="text-xs text-gray-500 mt-3">Tip: Set 43+ kW for rapid DC charging.</p>
        </div>

        <div className="md:col-span-3">
          <div className="card p-0 overflow-hidden">
            {center ? <Map center={center} stations={stations} /> : <div className="p-6">Enter a postcode or use your location.</div>}
          </div>

          <div className="mt-4 card">
            <h3 className="font-bold text-lg mb-2">Results ({stations.length})</h3>
            <ul className="divide-y">
              {stations.map((s: any) => (
                <li key={s.ID} className="py-3">
                  <p className="font-semibold">{s.AddressInfo?.Title}</p>
                  <p className="text-sm text-gray-600">{s.AddressInfo?.AddressLine1}, {s.AddressInfo?.Town} {s.AddressInfo?.Postcode}</p>
                  <p className="text-sm mt-1">
                    {(s.Connections || []).map((c: any, i: number) => (
                      <span key={i} className="badge mr-2 mb-1">
                        {(c.ConnectionType?.FormalName || c.ConnectionType?.Title || 'Connector')}
                        {c.PowerKW ? ` • ${c.PowerKW}kW` : ''}
                      </span>
                    ))}
                  </p>
                  {s.AddressInfo?.ContactTelephone1 ? <p className="text-sm text-gray-600 mt-1">Tel: {s.AddressInfo.ContactTelephone1}</p> : null}
                  {s.AddressInfo?.RelatedURL ? <a className="text-sm text-blue-600 underline" href={s.AddressInfo.RelatedURL} target="_blank">More info</a> : null}
                </li>
              ))}
              {stations.length === 0 && <li className="py-3 text-gray-600">No chargers found with current filters.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  </>
  );
}
