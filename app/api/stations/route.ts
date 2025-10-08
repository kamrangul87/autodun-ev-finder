import { NextResponse } from 'next/server'
import type { StationsResponse, Station } from '@/lib/types'

const DEMO_FALLBACK: Station[] = [
  { id: 'demo1', name: "ChargePoint London", lat: 51.5074, lng: -0.1278, address: "Oxford St, London", type: "Fast", powerKw: 50 },
  { id: 'demo2', name: "Tesla Supercharger", lat: 51.5155, lng: -0.0922, address: "City Road, London", type: "Rapid", powerKw: 150 },
  { id: 'demo3', name: "BP Pulse Birmingham", lat: 52.4862, lng: -1.8904, address: "High St, Birmingham", type: "Fast", powerKw: 50 },
  { id: 'demo4', name: "Shell Recharge Manchester", lat: 53.4808, lng: -2.2426, address: "Market St, Manchester", type: "Rapid", powerKw: 100 },
  { id: 'demo5', name: "Ionity Leeds", lat: 53.8008, lng: -1.5491, address: "Wellington St, Leeds", type: "Ultra-Rapid", powerKw: 350 }
]

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const source = process.env.STATIONS || 'OPENCHARGEMAP'
  
  console.log(`[Stations API] Source: ${source}`)
  
  if (source === 'OPENCHARGEMAP') {
    try {
      // OpenChargeMap API endpoint for UK stations near London
      const apiUrl = 'https://api.openchargemap.io/v3/poi/?output=json&countrycode=GB&maxresults=100&latitude=51.5074&longitude=-0.1278&distance=50&distanceunit=Miles'
      
      console.log('[Stations API] Fetching from OpenChargeMap:', apiUrl)
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)
      
      const response = await fetch(apiUrl, { 
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'User-Agent': 'Autodun-EV-Finder/1.0',
          'Accept': 'application/json'
        }
      })
      
      clearTimeout(timeoutId)
      
      console.log('[Stations API] Response status:', response.status)
      
      if (!response.ok) {
        throw new Error(`OpenChargeMap API returned ${response.status}`)
      }
      
      const data = await response.json()
      console.log(`[Stations API] Received ${data.length} stations from OpenChargeMap`)
      
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('No stations returned from API')
      }
      
      const items: Station[] = data
        .filter((poi: any) => {
          return poi?.AddressInfo?.Latitude && 
                 poi?.AddressInfo?.Longitude &&
                 poi?.AddressInfo?.Latitude >= -90 && 
                 poi?.AddressInfo?.Latitude <= 90 &&
                 poi?.AddressInfo?.Longitude >= -180 && 
                 poi?.AddressInfo?.Longitude <= 180
        })
        .slice(0, 50)
        .map((poi: any, index: number) => {
          const connections = poi.Connections || []
          const firstConnection = connections[0] || {}
          
          return {
            id: `ocm-${poi.ID || index}`,
            lat: parseFloat(poi.AddressInfo.Latitude),
            lng: parseFloat(poi.AddressInfo.Longitude),
            name: poi.AddressInfo.Title || poi.OperatorInfo?.Title || 'Charging Station',
            address: [
              poi.AddressInfo.AddressLine1,
              poi.AddressInfo.Town,
              poi.AddressInfo.StateOrProvince
            ].filter(Boolean).join(', '),
            postcode: poi.AddressInfo.Postcode || '',
            type: firstConnection.Level?.Title || firstConnection.ConnectionType?.Title || 'Standard',
            powerKw: firstConnection.PowerKW || 0,
            connectors: connections.length,
            source: 'OPENCHARGEMAP'
          }
        })
      
      console.log(`[Stations API] Returning ${items.length} processed stations`)
      
      return NextResponse.json({ 
        items, 
        source: 'OPENCHARGEMAP' 
      } as StationsResponse, {
        headers: {
          'Cache-Control': 'no-store, must-revalidate',
          'Content-Type': 'application/json'
        }
      })
      
    } catch (error) {
      console.error('[Stations API] OpenChargeMap fetch failed:', error)
      console.error('[Stations API] Error details:', error instanceof Error ? error.message : String(error))
    }
  }
  
  console.log('[Stations API] Using DEMO fallback')
  return NextResponse.json({ 
    items: DEMO_FALLBACK, 
    source: 'DEMO' 
  } as StationsResponse, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json'
    }
  })
}
