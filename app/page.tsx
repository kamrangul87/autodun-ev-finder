'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const Map = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const Tiles = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const Pin = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false })
const Info = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false })

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
  const [data, setData] = useState<Station[]>([])
  const [ok, setOk] = useState(false)
  
  useEffect(() => {
    fetch('/api/stations').then(r => r.json()).then(d => { setData(d.stations || []); setOk(true) })
  }, [])
  
  if (!ok) return <div>Loading</div>
  
  return <div style={{height:'100vh',width:'100%'}}><Map center={[54.5,-4]} zoom={6} style={{height:'100%'}}><Tiles url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{data.map(s=><Pin key={s.id} position={[s.lat,s.lng]}><Info>{s.name}</Info></Pin>)}</Map></div>
}
