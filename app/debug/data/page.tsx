'use client';
import React, { useEffect, useState } from 'react';

export default function DebugDataPage() {
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/stations', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d.items) ? d.items : []))
      .catch(e => setErr(String(e)));
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1>/debug/data</h1>
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
      <p><strong>Count:</strong> {items.length}</p>
      <pre style={{ background:'#f5f5f5', padding: 12, borderRadius: 8, maxHeight: 500, overflow: 'auto' }}>
        {JSON.stringify(items.slice(0,5), null, 2)}
      </pre>
    </div>
  );
}
