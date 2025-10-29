// pages/api/score.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const SCORER_URL = process.env.NEXT_PUBLIC_SCORER_URL || '';
const SCORER_KEY = process.env.AUTODUN_SCORER_KEY || '';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!SCORER_URL || !SCORER_KEY) {
    return res.status(500).json({ error: 'Scorer not configured' });
  }

  try {
    const r = await fetch(`${SCORER_URL}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Autodun-Key': SCORER_KEY,
      },
      body: JSON.stringify(req.body),
    });

    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: 'Scoring failed', detail: String(err?.message || err) });
  }
}
