'use client';

import React, { useState } from 'react';

type Props = {
  stationId: string | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void; // caller refreshes popup after success
};

export default function FeedbackModal({ stationId, open, onClose, onSuccess }: Props) {
  const [rating, setRating] = useState(3);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (!stationId) return;
    setBusy(true);
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, rating, comment }),
      });
      const j = await r.json();
      if (j?.ok !== true) throw new Error(j?.error || 'Submit failed');

      // reset + close
      setRating(3);
      setComment('');
      onClose();
      onSuccess?.(); // parent re-fetches popup summary
    } catch (e: any) {
      alert(e?.message || 'Submit failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-black/60 flex items-center justify-center">
      <div className="bg-white text-black w-full max-w-md rounded-2xl p-5 shadow-xl">
        <div className="text-lg font-semibold mb-3">Station feedback</div>
        <div className="text-xs text-gray-600 mb-4">Station ID: {stationId}</div>

        <label className="block mb-3">
          <div className="mb-1">Rating (0–5)</div>
          <input
            type="number"
            min={0}
            max={5}
            step={0.5}
            value={rating}
            onChange={e => setRating(Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
            className="w-full border rounded px-3 py-2"
          />
        </label>

        <label className="block mb-4">
          <div className="mb-1">Comment (optional)</div>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            className="w-full border rounded px-3 py-2 h-24"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200">Cancel</button>
          <button
            disabled={busy}
            onClick={submit}
            className="px-4 py-2 rounded-lg bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? 'Sending…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
