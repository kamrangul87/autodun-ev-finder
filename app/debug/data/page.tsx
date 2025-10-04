'use client'; import React,{useEffect,useState} from 'react';
export default function Debug(){ const [items,setItems]=useState<any[]>([]);
  useEffect(()=>{ fetch('/api/stations').then(r=>r.json()).then(d=>setItems(d.items||[])).catch(()=>setItems([])); },[]);
  return <div style={{padding:20}}><h1>/debug/data</h1><p><b>Count:</b> {items.length}</p><pre style={{maxHeight:500,overflow:'auto',background:'#f5f5f5',padding:12}}>{JSON.stringify(items.slice(0,5),null,2)}</pre></div>;
}
