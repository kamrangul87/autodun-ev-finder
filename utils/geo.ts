export const UK_BOUNDS = {
  west: -8.649,
  south: 49.823,
  east: 1.763,
  north: 60.845
};

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface Tile {
  west: number;
  south: number;
  east: number;
  north: number;
  hash: string;
}

export function splitBBoxIntoTiles(bbox: BBox, tiles: number): Tile[] {
  const { west, south, east, north } = bbox;
  const latStep = (north - south) / tiles;
  const lngStep = (east - west) / tiles;
  
  const result: Tile[] = [];
  
  for (let row = 0; row < tiles; row++) {
    for (let col = 0; col < tiles; col++) {
      const tileWest = west + col * lngStep;
      const tileSouth = south + row * latStep;
      const tileEast = west + (col + 1) * lngStep;
      const tileNorth = south + (row + 1) * latStep;
      
      result.push({
        west: tileWest,
        south: tileSouth,
        east: tileEast,
        north: tileNorth,
        hash: generateTileHash(tileWest, tileSouth, tileEast, tileNorth)
      });
    }
  }
  
  return result;
}

export function generateTileHash(west: number, south: number, east: number, north: number): string {
  return `tile_${west.toFixed(3)}_${south.toFixed(3)}_${east.toFixed(3)}_${north.toFixed(3)}`;
}

export function parseBBox(bboxStr: string | null): BBox | null {
  if (!bboxStr) return null;
  
  const parts = bboxStr.split(',').map(parseFloat);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  
  return {
    west: parts[0],
    south: parts[1],
    east: parts[2],
    north: parts[3]
  };
}

export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function pointInPolygon(point: [number, number], polygon: any): boolean {
  const [lng, lat] = point;
  
  const coords = polygon[0];
  if (!coords || coords.length < 3) return false;
  
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0], yi = coords[i][1];
    const xj = coords[j][0], yj = coords[j][1];
    
    const intersect = ((yi > lat) !== (yj > lat))
      && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  
  return inside;
}
