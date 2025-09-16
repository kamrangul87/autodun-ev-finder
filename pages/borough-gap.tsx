// pages/borough-gap.tsx
//
// Displays a borough‑level view of EV charging infrastructure relative to
// demand.  Data are aggregated from OpenChargeMap and council datasets via
// the `/api/borough` endpoint.  Each row shows the number of connectors in a
// borough, the number of EV registrations and the calculated gap index
// (registrations per connector).  A higher gap index indicates a larger
// shortfall of charging infrastructure.

import React, { useEffect, useState } from 'react';

interface BoroughStat {
  borough: string;
  stationCount: number;
  connectorCount: number;
  evRegistrations: number;
  gapIndex: number | null;
}

export default function BoroughGapPage() {
  const [data, setData] = useState<BoroughStat[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/borough', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`API responded ${res.status}`);
        const json = await res.json();
        setData(json as BoroughStat[]);
      } catch (err: any) {
        setError(err?.message || 'Failed to load data');
        setData([]);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0b1220', color: '#f9fafb', padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Borough Gap Index</h1>
      <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
        A higher gap index indicates more EV registrations per available connector, signalling areas with insufficient
        charging infrastructure. Data combines OpenChargeMap and council‑provided stations. EV registration counts
        are illustrative.
      </p>
      {loading && <p style={{ marginTop: '0.5rem', color: '#9ca3af' }}>Loading…</p>}
      {error && <p style={{ marginTop: '0.5rem', color: '#f87171' }}>{error}</p>}
      {!loading && !error && (
        <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #374151' }}>Borough</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #374151' }}>Connectors</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #374151' }}>EV Registrations</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #374151' }}>Gap Index</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.borough} style={{ borderBottom: '1px solid #1f2937' }}>
                <td style={{ padding: '0.5rem' }}>{row.borough}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>{row.connectorCount}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>{row.evRegistrations}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                  {row.gapIndex != null ? row.gapIndex.toFixed(2) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}