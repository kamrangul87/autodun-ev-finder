'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body style={{ padding: 24 }}>
        <h2>Something went wrong (global).</h2>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: 12, borderRadius: 8 }}>
          {error?.message ?? String(error)}
        </pre>
        <button
          onClick={() => reset()}
          style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, border: '1px solid #ddd' }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
