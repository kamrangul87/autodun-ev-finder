// pages/api/feedback.js
const feedbackStore = [];

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { stationId, type, timestamp } = req.body;
    if (!stationId) {
      return res.status(400).json({ error: 'stationId required' });
    }
    const feedback = {
      stationId,
      type: type || 'quick',
      timestamp: timestamp || new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent']
    };
    feedbackStore.push(feedback);
    if (feedbackStore.length > 1000) feedbackStore.shift();
    console.log('[FEEDBACK]', JSON.stringify(feedback));
    res.status(200).json({
      success: true,
      message: 'Feedback recorded',
      id: feedbackStore.length
    });
  } catch (error) {
    console.error('[API /feedback] Error:', error);
    res.status(500).json({ error: 'Failed to record feedback', message: error.message });
  }
}
