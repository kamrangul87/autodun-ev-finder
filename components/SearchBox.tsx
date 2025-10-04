'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';

export default function SearchBox(){
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const acRef = useRef<AbortController | null>(null);
  const map = useMap();

  useEffect(() => {
    if (!q || q.length < 3) { setResults([]); return; }
    if (acRef.current) acRef.current.abort();
    const ac = new AbortController(); acRef.current = ac;
    (async () => {
      try {
        // UK postcode first
        const resp = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(q), { signal: ac.signal });
        if (resp.ok) {
          const d = await resp.json();
          if (d && d.result && d.result.latitude && d.result.longitude) {
            setResults([{ display_name: d.result.postcode, lat: d.result.latitude, lon: d.result.longitude }]);
            return;
          }
        }
      } catch {}
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`;
        const r = await fetch(url, { signal: ac.signal, headers: { 'Accept-Language':'en-GB' }});
        const arr = await r.json();
        setResults(arr.slice(0,5));
      } catch { setResults([]); }
    })();
    return () => ac.abort();
  }, [q]);

  const go = (lat:number, lon:number) => {
    // @ts-ignore
    map.setView([lat, lon], 14);
    setResults([]);
  };

  return (
    <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', zIndex:1000 }}>
      <input
        placeholder="Search postcode or place…"
        value={q}
        onChange={e=>setQ(e.target.value)}
        style={{ width:280, padding:'8px 10px', borderRadius:8, border:'1px solid #ddd', background:'white' }}
      />
      {results.length>0 && (
        <div style={{ position:'absolute', top:'110%', left:0, right:0, background:'white', border:'1px solid #ddd', borderRadius:8, maxHeight:200, overflow:'auto' }}>
          {results.map((r,i)=> (
            <div key={i} onClick={()=>go(parseFloat(r.lat), parseFloat(r.lon))} style={{ padding:8, cursor:'pointer' }}>
              {r.display_name || r.postcode}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
