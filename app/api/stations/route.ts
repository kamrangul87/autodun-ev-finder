import { NextResponse } from 'next/server'
import type { StationsResponse, Station } from '@/lib/types'

const DEMO_FALLBACK: Station[] = [
  { id: 'demo1', name: "ChargePoint London", lat: 51.5074, lng: -0.1278, address: "Oxford St, London", type: "Fast", powerKw: 50 },
  { id: 'demo2', name: "Tesla Supercharger", lat: 51.5155, lng: -0.0922, address: "City Road, London", type: "Rapid", powerKw: 150 },
  { id: 'demo3', name: "BP Pulse Birmingham", lat: 52.4862, lng: -1.8904, address: "High St, Birmingham", type: "Fast", powerKw: 50 },
  { id: 'demo4', name: "Shell Recharge Manchester", lat: 53.4808, lng: -2.2426, address: "Market St, Manchester", type: "Rapid", powerKw: 100 },
  { id: 'demo5', name: "Ionity Leeds", lat: 53.8008, lng: -1.5491, address: "Wellington St, Leeds", type: "Ultra-Rapid", powerKw: 350 }
]

async function fetchWithTimeout(url: string, timeout: number) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'Autodun-EV-Finder/1.0' }
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

export async function GET() {
  const source = process.env.STATIONS || 'OPENCHARGEMAP'
  
  // Try OpenChargeMap API first
  if (source === 'OPENCHARGEMAP' || source === 'DEMO') {
    try {
      console.log('Fetching from OpenChargeMap API...')
      const response = await fetchWithTimeout(
        'https://api.openchargemap.io/v3/poi/?output=json&countrycode=GB&maxresults=100&compact=true&verbose=false&latitude=51.5074&longitude=-0.1278&distance=50&distanceunit=Miles',
        8000
      )
      
      if (response.ok) {
        const data = await response.json()
        console.log(`Received ${data.length} stations from OpenChargeMap`)
        
        const items: Station[] = data
          .filter((poi: any) => poi.AddressInfo?.Latitude && poi.AddressInfo?.Longitude)
          .map((poi: any) => ({
            id: `ocm-${poi.ID}`,
            lat: poi.AddressInfo.Latitude,
            lng: poi.AddressInfo.Longitude,
            name: poi.AddressInfo.Title || 'Charging Station',
            address: [poi.AddressInfo.AddressLine1, poi.AddressInfo.Town].filter(Boolean).join(', '),
            postcode: poi.AddressInfo.Postcode,
            type: poi.Connections?.[0]?.Level?.Title || 'Standard',
            powerKw: poi.Connections?.[0]?.PowerKW || 0,
            connectors: poi.Connections?.length || 0,
            source: 'OPENCHARGEMAP'
          }))
        
        if (items.length > 0) {
          console.log(`Returning ${items.length} live stations`)
          return NextResponse.json({ 
            items: items.slice(0, 50), 
            source: 'OPENCHARGEMAP' 
          } as StationsResponse)
        }
      }
    } catch (error) {
      console.error('OpenChargeMap API error:', error)
    }
  }
  
  // Fallback to demo data
  console.log('Using DEMO fallback data')
  return NextResponse.json({ 
    items: DEMO_FALLBACK, 
    source: 'DEMO' 
  } as StationsResponse)
}
