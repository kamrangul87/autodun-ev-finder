// pages/index.jsx
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';

const Map = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => <div style={{height:'75vh',display:'grid',placeItems:'center'}}>Loading map…</div>
});

export default function Home() {
  const [stations,setStations]=useState([]);
  const [council,setCouncil]=useState(null);
  const [source,setSource]=useState('DEMO');
  const [fellBack,setFellBack]=useState(false);
  const [loading,setLoading]=useState(true);
  const [ui,setUI]=useState({heat:true,markers:true,council:true,query:''});

  useEffect(()=>{ (async()=>{
    try{
      const r=await fetch('/api/stations'); const d=await r.json();
      setStations(d.items||[]); setSource(d.source||'DEMO'); setFellBack(!!d.fellBack);
    }catch(e){ setStations([]); }
    setLoading(false);
  })(); },[]);
  useEffect(()=>{ fetch('/data/london-councils.geojson').then(r=>r.json()).then(setCouncil).catch(()=>{}); },[]);

  return (
    <>
      <Head><title>Autodun EV Finder</title></Head>
      {(source==='DEMO' || fellBack) && (
        <div style={{padding:'10px',background:'#dc2626',color:'#fff',textAlign:'center',fontWeight:700}}>
          Using DEMO data ({stations.length} stations)
        </div>
      )}
      <div style={{padding:'12px',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',borderBottom:'1px solid #eee'}}>
        <input value={ui.query} onChange={e=>setUI(s=>({...s,query:e.target.value}))}
               placeholder="Enter UK postcode (e.g., SW1A 1AA)"
               style={{flex:'1 1 420px',padding:'8px',border:'1px solid #ddd',borderRadius:6}}/>
        <button style={{padding:'8px 16px',background:'#3b82f6',color:'#fff',border:'none',borderRadius:6}}>Go</button>
        <label><input type="checkbox" checked={ui.heat} onChange={()=>setUI(s=>({...s,heat:!s.heat}))}/> Heatmap ({stations.length})</label>
        <label><input type="checkbox" checked={ui.markers} onChange={()=>setUI(s=>({...s,markers:!s.markers}))}/> Markers ({stations.length})</label>
        <label><input type="checkbox" checked={ui.council} onChange={()=>setUI(s=>({...s,council:!s.council}))}/> Council ({council?.features?.length||0})</label>
      </div>
      <div style={{padding:'8px 12px',fontSize:12,color:'#555'}}>
        <b>Source:</b> {source} • <b>Stations:</b> {stations.length} • <b>Center:</b> London
      </div>
      <div style={{height:'75vh',position:'relative'}}>
        {!loading && (
          <Map
            stations={stations}
            showHeatmap={ui.heat}
            showMarkers={ui.markers}
            showCouncil={ui.council}
            councilData={council}
          />
        )}
      </div>
    </>
  );
}
