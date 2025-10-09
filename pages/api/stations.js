// pages/api/stations.js
import { fetchStations } from '../../lib/data-sources';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const result = await fetchStations();
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json({
      items: result.items,
      count: result.count,
      source: result.source,
      fellBack: result.fellBack || false,
      originalSource: result.originalSource,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API /stations] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch stations', message: error.message, items: [], count: 0
    });
  }
}
