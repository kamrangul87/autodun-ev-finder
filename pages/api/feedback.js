export const config = {
  runtime: 'nodejs',
};

export const dynamic = 'force-dynamic';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { stationId, council, councilId, vote, text, comment, lat, lng, zoom, ts, timestamp, type } = req.body;
    
    const feedbackData = {
      stationId: stationId || councilId,
      council,
      vote,
      type: type || (vote ? 'vote' : 'council'),
      text: text || comment,
      lat,
      lng,
      zoom,
      timestamp: ts || timestamp || new Date().toISOString(),
      userAgent: req.headers['user-agent']
    };

    const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;

    if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(feedbackData),
        });

        if (!response.ok) {
          console.error(`[feedback] Webhook failed with status ${response.status}`);
          console.log(`[feedback] ${JSON.stringify(feedbackData)}`);
        } else {
          console.log(`[feedback] Forwarded to webhook: ${feedbackData.type || 'unknown'}`);
        }

        return res.status(204).end();
      } catch (webhookError) {
        console.error('[feedback] Webhook error:', webhookError.message);
        console.log(`[feedback] ${JSON.stringify(feedbackData)}`);
        return res.status(204).end();
      }
    } else {
      console.log(`[feedback] ${JSON.stringify(feedbackData)}`);
      return res.status(200).json({ success: true, message: 'Feedback logged' });
    }
  } catch (error) {
    console.error('[API /feedback] Error:', error);
    return res.status(500).json({ error: 'Failed to process feedback', message: error.message });
  }
}
