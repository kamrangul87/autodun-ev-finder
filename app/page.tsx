'use client'
import { useEffect, useState, Fragment } from 'react'
import dynamic from 'next/dynamic'

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false })
const Polygon = dynamic(() => import('react-leaflet').then(m => m.Polygon), { ssr: false })
const Circle = dynamic(() => import('react-leaflet').then(m => m.Circle), { ssr: false })

interface Station {
  id: number
  name: string
  lat: number
  lng: number
  address: string
  type: string
  power: string
}

export default function Page() {
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [showMarkers, setShowMarkers] = useState(true)
  const [showCouncil, setShowCouncil] = useState(true)
  
  useEffect(() => {
    fetch('/api/stations')
      .then(r => r.json())
      .then(d => {
        setStations(d.stations || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])
  
  const filtered = stations.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.address.toLowerCase().includes(search.toLowerCase())
  )
  
  if (loading) return <div>Loading...</div>
  
  const headerBar = (
    <div className="absolute top-0 left-0 right-0 z-[1000] bg-white shadow-lg">
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-3">🔌 autodun</h1>
        <div className="flex gap-2 mb-3">
          <input type="text" placeholder="Search UK postcode or city..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 px-4 py-2 border rounded-lg" />
          <button className="px-6 py-2 bg-blue-500 text-white rounded-lg">Go</button>
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} />
            <span>🔥 Heatmap</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} />
            <span>📍 Markers ({filtered.length})</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showCouncil} onChange={(e) => setShowCouncil(e.target.checked)} />
            <span>🗺️ Council</span>
          </label>
        </div>
      </div>
    </div>
  )
  
  const mapContent = (
    <div className="w-full h-full pt-[160px]">
      <MapContainer center={[54.5, -4.0]} zoom={6} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {showCouncil && <Fragment>
          <Polygon positions={[[51.3, -0.5], [51.3, 0.3], [51.7, 0.3], [51.7, -0.5]]} pathOptions={{ color: '#ff7800', weight: 2, opacity: 0.65, dashArray: '5, 5', fillOpacity: 0.1 }} />
          <Polygon positions={[[52.4, -2.0], [52.4, -1.7], [52.6, -1.7], [52.6, -2.0]]} pathOptions={{ color: '#ff7800', weight: 2, opacity: 0.65, dashArray: '5, 5', fillOpacity: 0.1 }} />
        </Fragment>}
        {showHeatmap && filtered.map(s => <Circle key={`heat-${s.id}`} center={[s.lat, s.lng]} radius={30000} pathOptions={{ fillColor: 'red', fillOpacity: 0.2, stroke: false }} />)}
        {showMarkers && filtered.map(s => <Marker key={s.id} position={[s.lat, s.lng]}><Popup><div className="p-3 min-w-[280px]"><h3 className="font-bold text-lg mb-2">{s.name}</h3><p className="text-sm mb-1">📍 {s.address}</p><p className="text-sm mb-1">⚡ {s.type}</p><p className="text-sm mb-3">🔌 {s.power}</p><div className="flex gap-2"><a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer" className="flex-1 px-3 py-2 bg-blue-500 text-white text-center rounded text-sm">🧭 Directions</a><button onClick={() => {const m=prompt(`Feedback for ${s.name}:`);if(m)alert('Thanks!')}} className="flex-1 px-3 py-2 bg-green-500 text-white rounded text-sm">💬 Feedback</button></div></div></Popup></Marker>)}
      </MapContainer>
    </div>
  )
  
  return <div className="relative w-full h-screen">{headerBar}{mapContent}</div>
}
