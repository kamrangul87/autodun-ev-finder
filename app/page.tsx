'use client'
import { useEffect, useState, useRef } from 'react'
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
  const mapRef = useRef<any>(null)
  
  useEffect(() => {
    setMounted(true)
    fetch('/api/stations').then(r => r.json()).then(d => setStations(d.stations || []))
  }, [])
  
  if (!mounted) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}>Loading map...</div>
  
  const filtered = search ? stations.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.address.toLowerCase().includes(search.toLowerCase())
  ) : stations
  
  const handleSearch = () => {
    if (search && filtered.length > 0 && mapRef.current) {
      mapRef.current.setView([filtered[0].lat, filtered[0].lng], 14)
    }
  }
  
  return <div style={{position:'relative',width:'100%',height:'100vh'}}><div style={{position:'absolute',top:0,left:0,right:0,zIndex:1000,background:'white',boxShadow:'0 4px 6px rgba(0,0,0,0.1)'}}><div style={{padding:'16px'}}><h1 style={{fontSize:'28px',fontWeight:'bold',marginBottom:'16px'}}>🔌 autodun</h1><div style={{display:'flex',gap:'8px',marginBottom:'16px'}}><input type="text" placeholder="Search station name or city..." value={search} onChange={e=>setSearch(e.target.value)} onKeyPress={e=>e.key==='Enter'&&handleSearch()} style={{flex:1,padding:'12px 16px',border:'2px solid #e5e7eb',borderRadius:'8px',fontSize:'16px',outline:'none'}}/><button onClick={handleSearch} style={{padding:'12px 32px',background:'#3b82f6',color:'white',borderRadius:'8px',border:'none',cursor:'pointer',fontWeight:'600',fontSize:'16px'}}>Go</button></div><div style={{display:'flex',gap:'20px',fontSize:'15px'}}><label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontWeight:'500'}}><input type="checkbox" checked={showHeat} onChange={e=>setShowHeat(e.target.checked)} style={{width:'18px',height:'18px',cursor:'pointer'}}/><span>🔥 Heatmap</span></label><label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontWeight:'500'}}><input type="checkbox" checked={showPins} onChange={e=>setShowPins(e.target.checked)} style={{width:'18px',height:'18px',cursor:'pointer'}}/><span>📍 Markers ({filtered.length})</span></label><label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontWeight:'500'}}><input type="checkbox" checked={showCouncil} onChange={e=>setShowCouncil(e.target.checked)} style={{width:'18px',height:'18px',cursor:'pointer'}}/><span>🗺️ Council</span></label></div></div></div><div style={{width:'100%',height:'100%',paddingTop:'170px'}}><MapContainer ref={mapRef} center={[51.5074,-0.1278]} zoom={11} scrollWheelZoom={true} style={{height:'100%',width:'100%',zIndex:1}}><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19}/>{showCouncil&&<><Polygon positions={[[51.3,-0.5],[51.3,0.3],[51.7,0.3],[51.7,-0.5]]} pathOptions={{color:'#ff7800',weight:3,opacity:0.8,dashArray:'10, 10',fillOpacity:0.05}}/><Polygon positions={[[52.4,-2.0],[52.4,-1.7],[52.6,-1.7],[52.6,-2.0]]} pathOptions={{color:'#ff7800',weight:3,opacity:0.8,dashArray:'10, 10',fillOpacity:0.05}}/></>}{showHeat&&filtered.map(s=><Circle key={'h'+s.id} center={[s.lat,s.lng]} radius={20000} pathOptions={{fillColor:'#ef4444',fillOpacity:0.08,stroke:false}}/>)}{showPins&&filtered.map(s=><Marker key={s.id} position={[s.lat,s.lng]}><Popup maxWidth={320}><div style={{padding:'16px'}}><h3 style={{fontWeight:'bold',fontSize:'20px',marginBottom:'12px',color:'#1f2937'}}>{s.name}</h3><div style={{marginBottom:'16px'}}><p style={{fontSize:'15px',marginBottom:'6px',color:'#4b5563'}}>📍 {s.address}</p><p style={{fontSize:'15px',marginBottom:'6px',color:'#4b5563'}}>⚡ Type: <strong>{s.type}</strong></p><p style={{fontSize:'15px',color:'#4b5563'}}>🔌 Power: <strong>{s.power}</strong></p></div><div style={{display:'flex',gap:'10px'}}><a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer" style={{flex:1,padding:'10px',background:'#3b82f6',color:'white',textAlign:'center',borderRadius:'6px',textDecoration:'none',fontSize:'15px',fontWeight:'600'}}>🧭 Directions</a><button onClick={()=>{const m=prompt(`Feedback for ${s.name}:\n\nYour message:`);if(m){fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'User',email:'user@example.com',message:m,stationId:s.id})}).then(()=>alert('✅ Thank you for your feedback!'))}}} style={{flex:1,padding:'10px',background:'#10b981',color:'white',borderRadius:'6px',border:'none',fontSize:'15px',fontWeight:'600',cursor:'pointer'}}>💬 Feedback</button></div></div></Popup></Marker>)}</MapContainer></div></div>
}

export default Page
