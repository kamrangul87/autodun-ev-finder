// pages/api/stations.js
import { fetchStations } from '../../lib/data-sources';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    // Parse query parameters with defaults (London, 50km)
    const lat = req.query.lat ? parseFloat(req.query.lat) : 51.5074;
    const lng = req.query.lng ? parseFloat(req.query.lng) : -0.1278;
    const distance = req.query.distance ? parseFloat(req.query.distance) : 50;
    const radius = req.query.radius ? parseFloat(req.query.radius) : distance; // Accept both distance and radius
    const max = req.query.max ? parseInt(req.query.max) : 500;
    const src = req.query.src || null;

    const result = await fetchStations(lat, lng, radius, src, max);
    
    // Cache for 30 minutes with stale-while-revalidate
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
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
