import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const DEMO_FALLBACK = [
  { id: 'demo1', name: "ChargePoint London", lat: 51.5074, lng: -0.1278, address: "Oxford St, London", type: "Fast", powerKw: 50, source: 'DEMO' },
  { id: 'demo2', name: "Tesla Supercharger", lat: 51.5155, lng: -0.0922, address: "City Road, London", type: "Rapid", powerKw: 150, source: 'DEMO' },
  { id: 'demo3', name: "BP Pulse Birmingham", lat: 52.4862, lng: -1.8904, address: "High St, Birmingham", type: "Fast", powerKw: 50, source: 'DEMO' },
  { id: 'demo4', name: "Shell Recharge Manchester", lat: 53.4808, lng: -2.2426, address: "Market St, Manchester", type: "Rapid", powerKw: 100, source: 'DEMO' },
  { id: 'demo5', name: "Ionity Leeds", lat: 53.8008, lng: -1.5491, address: "Wellington St, Leeds", type: "Ultra-Rapid", powerKw: 350, source: 'DEMO' }
]

export async function GET(request: Request) {
  const source = process.env.STATIONS || 'OPENCHARGEMAP'
  
  console.log(`\n========================================`)
  console.log(`[Stations API] Starting request`)
  console.log(`[Stations API] Source setting: ${source}`)
  console.log(`[Stations API] Time: ${new Date().toISOString()}`)
  
  if (source === 'OPENCHARGEMAP') {
    try {
      const apiUrl = 'https://api.openchargemap.io/v3/poi/?output=json&countrycode=GB&maxresults=100&compact=true&verbose=false&latitude=51.5074&longitude=-0.1278&distance=50&distanceunit=Miles'
      
      console.log(`[Stations API] Fetching from: ${apiUrl}`)
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        console.log('[Stations API] Request timeout after 8s')
        controller.abort()
      }, 8000)
      
      const startTime = Date.now()
      const response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Autodun-EV-Finder/1.0)',
          'Accept': 'application/json',
        }
      })
      
      clearTimeout(timeoutId)
      const duration = Date.now() - startTime
      
      console.log(`[Stations API] Response status: ${response.status} ${response.statusText}`)
      console.log(`[Stations API] Response time: ${duration}ms`)
      console.log(`[Stations API] Response headers:`, Object.fromEntries(response.headers.entries()))
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[Stations API] Error response body:`, errorText.substring(0, 500))
        throw new Error(`API returned ${response.status}: ${errorText.substring(0, 100)}`)
      }
      
      const data = await response.json()
      
      console.log(`[Stations API] Raw data type:`, typeof data)
      console.log(`[Stations API] Is array:`, Array.isArray(data))
      console.log(`[Stations API] Data length:`, data?.length)
      console.log(`[Stations API] First item:`, JSON.stringify(data?.[0], null, 2).substring(0, 500))
      
      if (!Array.isArray(data)) {
        throw new Error(`API returned non-array: ${typeof data}`)
      }
      
      if (data.length === 0) {
        throw new Error('API returned empty array')
      }
      
      const items = data
        .filter((poi: any) => {
          const hasCoords = poi?.AddressInfo?.Latitude && poi?.AddressInfo?.Longitude
          if (!hasCoords) {
            console.log(`[Stations API] Skipping POI ${poi?.ID}: missing coordinates`)
          }
          return hasCoords
        })
        .slice(0, 50)
        .map((poi: any) => {
          const connections = poi.Connections || []
          const firstConn = connections[0] || {}
          
          return {
            id: `ocm-${poi.ID}`,
            lat: parseFloat(poi.AddressInfo.Latitude),
            lng: parseFloat(poi.AddressInfo.Longitude),
            name: poi.AddressInfo?.Title || poi.OperatorInfo?.Title || 'Charging Station',
            address: [poi.AddressInfo?.AddressLine1, poi.AddressInfo?.Town]
              .filter(Boolean)
              .join(', ') || 'Address not available',
            postcode: poi.AddressInfo?.Postcode || '',
            type: firstConn.Level?.Title || firstConn.ConnectionType?.Title || 'Standard',
            powerKw: firstConn.PowerKW || 0,
            connectors: connections.length,
            source: 'OPENCHARGEMAP'
          }
        })
      
      console.log(`[Stations API] ✅ SUCCESS: Returning ${items.length} live stations`)
      console.log(`[Stations API] Sample station:`, items[0])
      console.log(`========================================\n`)
      
      return NextResponse.json({
        items,
        source: 'OPENCHARGEMAP'
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
      
    } catch (error) {
      console.error(`[Stations API] ❌ ERROR:`, error)
      console.error(`[Stations API] Error type:`, error instanceof Error ? error.constructor.name : typeof error)
      console.error(`[Stations API] Error message:`, error instanceof Error ? error.message : String(error))
      console.error(`[Stations API] Error stack:`, error instanceof Error ? error.stack : 'N/A')
      console.log(`[Stations API] Falling back to DEMO data`)
      console.log(`========================================\n`)
    }
  }
  
  console.log(`[Stations API] Returning DEMO fallback`)
  console.log(`========================================\n`)
  
  return NextResponse.json({
    items: DEMO_FALLBACK,
    source: 'DEMO'
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json'
    }
  })
}
