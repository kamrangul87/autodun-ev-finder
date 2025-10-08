import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

const EMPTY: any = { type: 'FeatureCollection', features: [] }

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
  try {
    const remoteUrl = process.env.COUNCIL_DATA_URL
    if (remoteUrl) {
      try {
        const response = await fetchWithTimeout(remoteUrl, 6000)
        if (response.ok) {
          const data = await response.json()
          return NextResponse.json(data)
        }
      } catch (error) {
        console.warn('Remote council data failed')
      }
    }
    
    try {
      const filePath = join(process.cwd(), 'public', 'data', 'councils-london.geo.json')
      const fileContent = await readFile(filePath, 'utf-8')
      return NextResponse.json(JSON.parse(fileContent))
    } catch (error) {
      console.warn('Local council file not found')
    }
    
    return NextResponse.json(EMPTY)
  } catch (error) {
    return NextResponse.json(EMPTY)
  }
}
