export interface Station {
  id: string | number
  lat: number
  lng: number
  name?: string
  address?: string
  postcode?: string
  connectors?: number
  powerKw?: number
  type?: string
  source?: string
}

export interface StationsResponse {
  items: Station[]
  source: string
}

export interface CouncilFeature {
  type: 'Feature'
  properties: {
    name: string
    [key: string]: any
  }
  geometry: any
}

export interface CouncilData {
  type: 'FeatureCollection'
  features: CouncilFeature[]
}
