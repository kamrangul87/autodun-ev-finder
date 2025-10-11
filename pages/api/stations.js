// pages/api/stations.js
import { fetchStations } from '../../lib/data-sources';

// Force dynamic rendering on Vercel - no static caching
export const config = {
  runtime: 'nodejs',
};

export const dynamic = 'force-dynamic';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    // Parse query parameters with defaults (London, 50km, 1000 max)
    const lat = req.query.lat ? parseFloat(req.query.lat) : 51.5074;
    const lng = req.query.lng ? parseFloat(req.query.lng) : -0.1278;
    const distance = req.query.distance ? parseFloat(req.query.distance) : 50;
    const radius = req.query.radius ? parseFloat(req.query.radius) : distance;
    const max = req.query.max ? parseInt(req.query.max) : 1000; // Default to 1000
    const src = req.query.src || null;

    const result = await fetchStations(lat, lng, radius, src, max);
    
    // Disable caching - always fresh data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.status(200).json({
      items: result.items,
      count: result.count,
      source: result.source,
      fellBack: result.fellBack || false,
      originalSource: result.originalSource,
      center: { lat, lng },
      radius,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API /stations] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch stations', message: error.message, items: [], count: 0
    });
  }
}
