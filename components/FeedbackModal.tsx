'use client';
import { useEffect, useState } from 'react';

type Detail = { stationId?: string | number; name?: string };

export default function FeedbackModal() {
  const [open, setOpen] = useState(false);
  const [station, setStation] = useState<Detail | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    const onOpen = (e: any) => {
      setStation(e?.detail || null);
      setNote('');
      setOpen(true);
    };
    window.addEventListener('autodun:feedback', onOpen);
    return () => window.removeEventListener('autodun:feedback', onOpen);
  }, []);

  async function submit(kind: 'positive' | 'negative') {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: station?.stationId ?? null,
          action: kind,
          note: note || null,
        }),
      });
    } catch {}
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      
    >
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          padding: 16,
          width: 360,
          boxShadow: '0 6px 24px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Feedback</h3>
        <p style={{ marginBottom: 8 }}>
          {station?.name ? station.name : 'Charging Point'}
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note…"
          style={{
            width: '100%',
            minHeight: 80,
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: 8,
            marginBottom: 12,
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc' }}
          >
            Cancel
          </button>
          <button
            onClick={() => submit('negative')}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc' }}
          >
            Problem
          </button>
          <button
            onClick={() => submit('positive')}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc', background: '#f3f3f3' }}
          >
            Looks Good
          </button>
        </div>
      </div>
    </div>
  );
}
