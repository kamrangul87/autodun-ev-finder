'use client';

import React, { useState } from 'react';

type Props = {
  stationId: string | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function FeedbackModal({ stationId, open, onClose, onSuccess }: Props) {
  const [waitTime, setWaitTime] = useState(0);
  const [priceFair, setPriceFair] = useState(3);
  const [working, setWorking] = useState(true);
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
        body: JSON.stringify({ stationId, waitTime, priceFair, working, comment }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'submit failed');
      onClose(); setWaitTime(0); setPriceFair(3); setWorking(true); setComment('');
      onSuccess?.();
      alert('Thanks! Feedback recorded.');
    } catch (e: any) {
      alert(e.message || 'Submit failed');
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
          <div className="mb-1">Wait time (0–5)</div>
          <input type="number" min={0} max={5} value={waitTime}
                 onChange={e => setWaitTime(parseInt(e.target.value || '0', 10))}
                 className="w-full border rounded px-3 py-2" />
        </label>

        <label className="block mb-3">
          <div className="mb-1">Price fairness (0–5)</div>
          <input type="number" min={0} max={5} value={priceFair}
                 onChange={e => setPriceFair(parseInt(e.target.value || '0', 10))}
                 className="w-full border rounded px-3 py-2" />
        </label>

        <label className="flex items-center gap-2 mb-3">
          <input type="checkbox" checked={working} onChange={e => setWorking(e.target.checked)} />
          <span>Charger working</span>
        </label>

        <label className="block mb-4">
          <div className="mb-1">Comment (optional)</div>
          <textarea value={comment} onChange={e => setComment(e.target.value)}
                    className="w-full border rounded px-3 py-2 h-24" />
        </label>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200">Cancel</button>
          <button disabled={busy} onClick={submit}
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-60">
            {busy ? 'Sending…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
