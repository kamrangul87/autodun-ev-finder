'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ padding: 24 }}>
      <h2>Something went wrong.</h2>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: 12, borderRadius: 8 }}>
        {error?.message ?? String(error)}
      </pre>
      <button
        onClick={() => reset()}
        style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, border: '1px solid #ddd' }}
      >
        Try again
      </button>
    </div>
  );
}
