import React, { useState } from 'react';

export default function ScoreTestPage() {
  const [power_kw, setPowerKw] = useState(50);
  const [n_connectors, setNConnectors] = useState(3);
  const [has_fast_dc, setHasFastDc] = useState(1);
  const [rating, setRating] = useState(4.6);
  const [usage_score, setUsageScore] = useState(1);
  const [has_geo, setHasGeo] = useState(1);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleScore(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const resp = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ power_kw, n_connectors, has_fast_dc, rating, usage_score, has_geo }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || 'Failed');
      setResult(data);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Score Test</h1>
      <p>This calls your <code>/api/score</code> route (which talks to Replit).</p>

      <form onSubmit={handleScore} style={{ display: 'grid', gap: 12 }}>
        <label>power_kw
          <input type="number" value={power_kw} onChange={e => setPowerKw(+e.target.value)} />
        </label>
        <label>n_connectors
          <input type="number" value={n_connectors} onChange={e => setNConnectors(+e.target.value)} />
        </label>
        <label>has_fast_dc (0 or 1)
          <input type="number" value={has_fast_dc} onChange={e => setHasFastDc(+e.target.value)} />
        </label>
        <label>rating (0–5)
          <input type="number" step="0.1" value={rating} onChange={e => setRating(+e.target.value)} />
        </label>
        <label>usage_score (0 or 1)
          <input type="number" value={usage_score} onChange={e => setUsageScore(+e.target.value)} />
        </label>
        <label>has_geo (0 or 1)
          <input type="number" value={has_geo} onChange={e => setHasGeo(+e.target.value)} />
        </label>

        <button disabled={loading} type="submit">
          {loading ? 'Scoring…' : 'Get score'}
        </button>
      </form>

      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      {result && (
        <pre style={{ background: '#111', color: '#0f0', padding: 12, borderRadius: 8 }}>
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
