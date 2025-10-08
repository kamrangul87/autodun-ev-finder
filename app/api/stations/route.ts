import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const DEMO = [
  { id: 'demo1', name: "ChargePoint London", lat: 51.5074, lng: -0.1278, address: "Oxford St, London", type: "Fast", powerKw: 50, source: 'DEMO' },
  { id: 'demo2', name: "Tesla Supercharger", lat: 51.5155, lng: -0.0922, address: "City Road, London", type: "Rapid", powerKw: 150, source: 'DEMO' },
  { id: 'demo3', name: "BP Pulse Birmingham", lat: 52.4862, lng: -1.8904, address: "High St, Birmingham", type: "Fast", powerKw: 50, source: 'DEMO' },
  { id: 'demo4', name: "Shell Recharge Manchester", lat: 53.4808, lng: -2.2426, address: "Market St, Manchester", type: "Rapid", powerKw: 100, source: 'DEMO' },
  { id: 'demo5', name: "Ionity Leeds", lat: 53.8008, lng: -1.5491, address: "Wellington St, Leeds", type: "Ultra-Rapid", powerKw: 350, source: 'DEMO' }
]

export async function GET() {
  console.log('[API] Stations endpoint called')
  
  // ALWAYS try OpenChargeMap first
  try {
    const url = 'https://api.openchargemap.io/v3/poi/?output=json&countrycode=GB&maxresults=100&compact=true&verbose=false&latitude=51.5074&longitude=-0.1278&distance=50&distanceunit=Miles'
    
    console.log('[API] Fetching:', url)
    
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Autodun/1.0)',
        'Accept': 'application/json'
      }
    })
    
    console.log('[API] Response:', response.status, response.statusText)
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const data = await response.json()
    console.log('[API] Data received:', Array.isArray(data), data?.length)
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Invalid data format')
    }
    
    const items = data
      .filter((p: any) => p?.AddressInfo?.Latitude && p?.AddressInfo?.Longitude)
      .slice(0, 50)
      .map((p: any) => ({
        id: `ocm-${p.ID}`,
        lat: parseFloat(p.AddressInfo.Latitude),
        lng: parseFloat(p.AddressInfo.Longitude),
        name: p.AddressInfo?.Title || 'Charging Station',
        address: [p.AddressInfo?.AddressLine1, p.AddressInfo?.Town].filter(Boolean).join(', '),
        postcode: p.AddressInfo?.Postcode || '',
        type: p.Connections?.[0]?.Level?.Title || 'Standard',
        powerKw: p.Connections?.[0]?.PowerKW || 0,
        connectors: p.Connections?.length || 0,
        source: 'OPENCHARGEMAP'
      }))
    
    console.log('[API] Returning', items.length, 'live stations')
    
    return NextResponse.json({
      items,
      source: 'OPENCHARGEMAP',
      debug: {
        rawCount: data.length,
        filtered: items.length,
        timestamp: new Date().toISOString()
      }
    })
    
  } catch (error) {
    console.error('[API] Error:', error)
    console.log('[API] Falling back to DEMO')
    
    return NextResponse.json({
      items: DEMO,
      source: 'DEMO',
      debug: {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }
    })
  }
}
