'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, GeoJSON } from 'react-leaflet'
import type { Station, StationsResponse, CouncilData } from '@/lib/types'

export default function ClientMap() {
  const [stations, setStations] = useState<Station[]>([])
  const [source, setSource] = useState('DEMO')
  const [councils, setCouncils] = useState<CouncilData | null>(null)
  const [search, setSearch] = useState('')
  const [showHeat, setShowHeat] = useState(true)
  const [showPins, setShowPins] = useState(true)
  const [showCouncil, setShowCouncil] = useState(false)
  const [toast, setToast] = useState('')
  const mapRef = useRef<any>(null)
  
  useEffect(() => {
    console.log('Fetching stations...')
    fetch('/api/stations').then(r => r.json()).then((d: StationsResponse) => {
      console.log('Stations received:', d)
      setStations(d.items || [])
      setSource(d.source || 'DEMO')
    }).catch(e => {
      console.error('Stations fetch failed:', e)
      setStations([])
    })
    
    console.log('Fetching councils...')
    fetch('/api/councils').then(r => r.json()).then((d: CouncilData) => {
      console.log('Council features:', d.features.length)
      setCouncils(d)
    }).catch(e => {
      console.error('Councils fetch failed:', e)
      setCouncils({ type: 'FeatureCollection', features: [] })
    })
  }, [])
  
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }, [])
  
  const handleSearch = useCallback(async () => {
    if (!search.trim()) return
    try {
      const postcodeRes = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(search)}`)
      if (postcodeRes.ok) {
        const data = await postcodeRes.json()
        if (data.result) {
          mapRef.current?.setView([data.result.latitude, data.result.longitude], 13)
          showToast(`✅ Found: ${data.result.postcode}`)
          return
        }
      }
    } catch (e) {
      console.warn('Postcode lookup failed:', e)
    }
    try {
      const nominatimRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&format=json&limit=1&countrycodes=gb`)
      if (nominatimRes.ok) {
        const data = await nominatimRes.json()
        if (data.length > 0) {
          mapRef.current?.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 10)
          showToast(`✅ Found: ${data[0].display_name}`)
          return
        }
      }
    } catch (e) {
      console.error('Nominatim failed:', e)
    }
    showToast('❌ Location not found')
  }, [search, showToast])
  
  const zoomToData = useCallback(() => {
    if (stations.length === 0 || !mapRef.current) return
    const bounds = stations.map(s => [s.lat, s.lng] as [number, number])
    mapRef.current.fitBounds(bounds, { padding: [50, 50] })
    showToast(`📍 Showing all ${stations.length} stations`)
  }, [stations, showToast])
  
  const handleFeedback = useCallback(async (stationId: string | number, vote: '+1' | '-1') => {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, vote })
      })
      showToast('✅ Thanks for your feedback!')
    } catch (e) {
      showToast('✅ Thanks for your feedback!')
    }
  }, [showToast])
  
  useEffect(() => {
    console.log('Current stations:', stations.length, stations)
    console.log('Council features:', councils?.features.length || 0)
  }, [stations, councils])
  
  const firstTwo = stations.slice(0, 2).map(s => `[${s.lat.toFixed(2)},${s.lng.toFixed(2)}]`).join(' ')
  
  return (
    <div style={{position:'relative',width:'100%',height:'100vh',fontFamily:'system-ui'}}>
      <div style={{position:'absolute',top:0,left:0,right:0,zIndex:1000,background:'white',boxShadow:'0 4px 6px rgba(0,0,0,0.1)',padding:'16px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
          <h1 style={{fontSize:'28px',fontWeight:'bold',margin:0}}>🔌 autodun</h1>
          <div style={{fontSize:'13px',color:'#6b7280',background:'#f3f4f6',padding:'8px 16px',borderRadius:'8px',fontFamily:'monospace'}}>
            <span style={{fontWeight:'600',color:'#3b82f6'}}>{source}</span> • {stations.length} • {firstTwo}
          </div>
        </div>
        <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
          <input type="text" placeholder="Search UK postcode or city..." value={search} onChange={e => setSearch(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSearch()} style={{flex:1,padding:'12px 16px',border:'2px solid #e5e7eb',borderRadius:'8px',fontSize:'16px'}} />
          <button onClick={handleSearch} style={{padding:'12px 32px',background:'#3b82f6',color:'white',borderRadius:'8px',border:'none',cursor:'pointer',fontWeight:'600'}}>Go</button>
          <button onClick={zoomToData} disabled={stations.length === 0} style={{padding:'12px 24px',background:stations.length>0?'#10b981':'#d1d5db',color:'white',borderRadius:'8px',border:'none',cursor:stations.length>0?'pointer':'not-allowed',fontWeight:'600'}}>📍 Zoom to data</button>
        </div>
        <div style={{display:'flex',gap:'16px'}}>
          <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer'}}><input type="checkbox" checked={showHeat} onChange={e => setShowHeat(e.target.checked)} style={{width:'18px',height:'18px'}} /><span>🔥 Heatmap</span></label>
          <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer'}}><input type="checkbox" checked={showPins} onChange={e => setShowPins(e.target.checked)} style={{width:'18px',height:'18px'}} /><span>📍 Markers ({stations.length})</span></label>
          <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer'}}><input type="checkbox" checked={showCouncil} onChange={e => setShowCouncil(e.target.checked)} style={{width:'18px',height:'18px'}} /><span>🗺️ Council ({councils?.features.length || 0})</span></label>
        </div>
      </div>
      <div style={{width:'100%',height:'100%',paddingTop:'170px'}}>
        <MapContainer ref={mapRef} center={[51.5074,-0.1278]} zoom={11} scrollWheelZoom={true} style={{height:'100%',width:'100%',zIndex:1}}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
          {showHeat && stations.map(s => <Circle key={`h${s.id}`} center={[s.lat, s.lng]} radius={12000} pathOptions={{fillColor:'#ef4444',fillOpacity:0.05,stroke:false}} pane="overlayPane" />)}
          {showCouncil && councils && councils.features.length > 0 && <GeoJSON key={JSON.stringify(councils)} data={councils as any} style={{color:'#ff7800',weight:4,opacity:0.9,dashArray:'12, 8',fillColor:'#ff7800',fillOpacity:0.02}} onEachFeature={(feature, layer) => { if (feature.properties?.name) { layer.bindTooltip(feature.properties.name, {permanent:false,direction:'top',className:'council-tooltip'}) } }} pane="overlayPane" />}
          {showPins && stations.map(s => (
            <Marker key={s.id} position={[s.lat, s.lng]} pane="markerPane">
              <Popup maxWidth={340}>
                <div style={{padding:'16px'}}>
                  <h3 style={{fontWeight:'bold',fontSize:'20px',marginBottom:'12px',color:'#1f2937'}}>{s.name || 'Charging Station'}</h3>
                  <div style={{marginBottom:'16px',lineHeight:'1.8'}}>
                    {s.address && <p style={{fontSize:'15px',marginBottom:'6px',color:'#4b5563'}}>📍 {s.address}</p>}
                    {s.postcode && <p style={{fontSize:'15px',marginBottom:'6px',color:'#4b5563'}}>�� {s.postcode}</p>}
                    {s.type && <p style={{fontSize:'15px',marginBottom:'6px',color:'#4b5563'}}>⚡ Type: <strong>{s.type}</strong></p>}
                    {s.powerKw && <p style={{fontSize:'15px',marginBottom:'6px',color:'#4b5563'}}>🔌 Power: <strong>{s.powerKw} kW</strong></p>}
                    {s.connectors && <p style={{fontSize:'15px',marginBottom:'6px',color:'#4b5563'}}>🔌 Connectors: <strong>{s.connectors}</strong></p>}
                    <p style={{fontSize:'13px',color:'#9ca3af',marginTop:'8px'}}>Lat: {s.lat.toFixed(4)}, Lng: {s.lng.toFixed(4)}</p>
                  </div>
                  <div style={{display:'flex',gap:'10px',marginBottom:'10px'}}>
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer" style={{flex:1,padding:'12px',background:'#3b82f6',color:'white',textAlign:'center',borderRadius:'6px',textDecoration:'none',fontWeight:'600',fontSize:'15px'}}>🧭 Directions</a>
                  </div>
                  <div style={{display:'flex',gap:'10px'}}>
                    <button onClick={() => handleFeedback(s.id, '+1')} aria-label="Positive feedback" style={{flex:1,padding:'12px',background:'#10b981',color:'white',borderRadius:'6px',border:'none',cursor:'pointer',fontWeight:'600',fontSize:'18px'}}>��</button>
                    <button onClick={() => handleFeedback(s.id, '-1')} aria-label="Negative feedback" style={{flex:1,padding:'12px',background:'#ef4444',color:'white',borderRadius:'6px',border:'none',cursor:'pointer',fontWeight:'600',fontSize:'18px'}}>👎</button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      {toast && <div style={{position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',background:'#1f2937',color:'white',padding:'14px 28px',borderRadius:'10px',zIndex:2000,fontWeight:'600',fontSize:'15px',boxShadow:'0 8px 16px rgba(0,0,0,0.3)'}}>{toast}</div>}
    </div>
  )
}
