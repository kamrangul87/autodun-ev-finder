'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false })
const Circle = dynamic(() => import('react-leaflet').then(m => m.Circle), { ssr: false })
const Polygon = dynamic(() => import('react-leaflet').then(m => m.Polygon), { ssr: false })

interface Station {
  id: number
  name: string
  lat: number
  lng: number
  address: string
  type: string
  power: string
}

function Page() {
  const [stations, setStations] = useState<Station[]>([])
  const [mounted, setMounted] = useState(false)
  const [search, setSearch] = useState('')
  const [showHeat, setShowHeat] = useState(true)
  const [showPins, setShowPins] = useState(true)
  const [showCouncil, setShowCouncil] = useState(true)
  
  useEffect(() => {
    setMounted(true)
    fetch('/api/stations').then(r => r.json()).then(d => setStations(d.stations || []))
  }, [])
  
  if (!mounted) return <div>Loading...</div>
  
  const filtered = stations.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.address.toLowerCase().includes(search.toLowerCase()))
  
  return <div style={{position:'relative',width:'100%',height:'100vh'}}><div style={{position:'absolute',top:0,left:0,right:0,zIndex:1000,background:'white',boxShadow:'0 2px 4px rgba(0,0,0,0.1)'}}><div style={{padding:'16px'}}><h1 style={{fontSize:'24px',fontWeight:'bold',marginBottom:'12px'}}>🔌 autodun</h1><div style={{display:'flex',gap:'8px',marginBottom:'12px'}}><input type="text" placeholder="Search UK postcode or city..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,padding:'8px 16px',border:'1px solid #ccc',borderRadius:'8px'}}/><button style={{padding:'8px 24px',background:'#3b82f6',color:'white',borderRadius:'8px',border:'none'}}>Go</button></div><div style={{display:'flex',gap:'16px',fontSize:'14px'}}><label style={{display:'flex',alignItems:'center',gap:'8px'}}><input type="checkbox" checked={showHeat} onChange={e=>setShowHeat(e.target.checked)}/><span>🔥 Heatmap</span></label><label style={{display:'flex',alignItems:'center',gap:'8px'}}><input type="checkbox" checked={showPins} onChange={e=>setShowPins(e.target.checked)}/><span>📍 Markers ({filtered.length})</span></label><label style={{display:'flex',alignItems:'center',gap:'8px'}}><input type="checkbox" checked={showCouncil} onChange={e=>setShowCouncil(e.target.checked)}/><span>🗺️ Council</span></label></div></div></div><div style={{width:'100%',height:'100%',paddingTop:'160px'}}><MapContainer center={[54.5,-4.0]} zoom={6} scrollWheelZoom={true} style={{height:'100%',width:'100%'}}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{showCouncil&&<><Polygon positions={[[51.3,-0.5],[51.3,0.3],[51.7,0.3],[51.7,-0.5]]} pathOptions={{color:'#ff7800',weight:2,opacity:0.65,dashArray:'5, 5',fillOpacity:0.1}}/><Polygon positions={[[52.4,-2.0],[52.4,-1.7],[52.6,-1.7],[52.6,-2.0]]} pathOptions={{color:'#ff7800',weight:2,opacity:0.65,dashArray:'5, 5',fillOpacity:0.1}}/></>}{showHeat&&filtered.map(s=><Circle key={'h'+s.id} center={[s.lat,s.lng]} radius={30000} pathOptions={{fillColor:'red',fillOpacity:0.2,stroke:false}}/>)}{showPins&&filtered.map(s=><Marker key={s.id} position={[s.lat,s.lng]}><Popup><div style={{padding:'12px',minWidth:'280px'}}><h3 style={{fontWeight:'bold',fontSize:'18px',marginBottom:'8px'}}>{s.name}</h3><p style={{fontSize:'14px',marginBottom:'4px'}}>📍 {s.address}</p><p style={{fontSize:'14px',marginBottom:'4px'}}>⚡ {s.type}</p><p style={{fontSize:'14px',marginBottom:'12px'}}>🔌 {s.power}</p><div style={{display:'flex',gap:'8px'}}><a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer" style={{flex:1,padding:'8px',background:'#3b82f6',color:'white',textAlign:'center',borderRadius:'4px',textDecoration:'none',fontSize:'14px'}}>🧭 Directions</a><button onClick={()=>{const m=prompt(`Feedback for ${s.name}:`);if(m)alert('Thanks!')}} style={{flex:1,padding:'8px',background:'#10b981',color:'white',borderRadius:'4px',border:'none',fontSize:'14px'}}>💬 Feedback</button></div></div></Popup></Marker>)}</MapContainer></div></div>
}

export default Page
