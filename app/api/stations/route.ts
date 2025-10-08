import { NextResponse } from 'next/server'
import type { StationsResponse } from '@/lib/types'

const DEMO_STATIONS = [
  { id: 1, name: "ChargePoint London", lat: 51.5074, lng: -0.1278, address: "Oxford St, London", type: "Fast", powerKw: 50 },
  { id: 2, name: "Tesla Supercharger", lat: 51.5155, lng: -0.0922, address: "City Road, London", type: "Rapid", powerKw: 150 },
  { id: 3, name: "BP Pulse Birmingham", lat: 52.4862, lng: -1.8904, address: "High St, Birmingham", type: "Fast", powerKw: 50 },
  { id: 4, name: "Shell Recharge Manchester", lat: 53.4808, lng: -2.2426, address: "Market St, Manchester", type: "Rapid", powerKw: 100 },
  { id: 5, name: "Ionity Leeds", lat: 53.8008, lng: -1.5491, address: "Wellington St, Leeds", type: "Ultra-Rapid", powerKw: 350 }
]

async function fetchWithTimeout(url: string, timeout: number) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

export async function GET() {
  const source = process.env.STATIONS || 'DEMO'
  
  try {
    if (source === 'OPENCHARGEMAP') {
      try {
        const response = await fetchWithTimeout(
          'https://api.openchargemap.io/v3/poi/?output=json&countrycode=GB&maxresults=50&compact=true&verbose=false',
          8000
        )
        
        if (response.ok) {
          const data = await response.json()
          const items = data.slice(0, 50).map((poi: any) => ({
            id: poi.ID,
            lat: poi.AddressInfo?.Latitude || 0,
            lng: poi.AddressInfo?.Longitude || 0,
            name: poi.AddressInfo?.Title || 'Charging Station',
            address: poi.AddressInfo?.AddressLine1,
            postcode: poi.AddressInfo?.Postcode,
            type: poi.Connections?.[0]?.Level?.Title,
            powerKw: poi.Connections?.[0]?.PowerKW,
            connectors: poi.Connections?.length,
            source: 'OPENCHARGEMAP'
          })).filter((s: any) => s.lat && s.lng)
          
          return NextResponse.json({ items, source: 'OPENCHARGEMAP' } as StationsResponse)
        }
      } catch (error) {
        console.error('OpenChargeMap failed:', error)
      }
    }
    
    return NextResponse.json({ 
      items: DEMO_STATIONS.map(s => ({ ...s, source: 'DEMO' })), 
      source: 'DEMO' 
    } as StationsResponse)
    
  } catch (error) {
    return NextResponse.json({ 
      items: DEMO_STATIONS.map(s => ({ ...s, source: 'DEMO' })), 
      source: 'DEMO' 
    } as StationsResponse)
  }
}
