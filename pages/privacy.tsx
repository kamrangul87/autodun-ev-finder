// pages/privacy.tsx
export default function Privacy() {
  return (
    <main style={{ maxWidth: 820, margin: '40px auto', padding: '0 16px', lineHeight: 1.6 }}>
      <h1 style={{ marginBottom: 12 }}>Privacy</h1>
      <p>
        Autodun EV Finder records a small amount of anonymized telemetry (e.g., feature usage and a
        non-PII session id) to improve reliability and plan features. We do not log names, email
        addresses, or exact search queries — searches are hashed before logging.
      </p>

      <h2 style={{ marginTop: 24, fontSize: 18 }}>What we collect</h2>
      <ul>
        <li>Anonymous session id</li>
        <li>Non-PII usage events (toggle heatmap/markers/council, open drawer, score requested/returned)</li>
        <li>Basic performance metrics (cache HIT/MISS, response time buckets)</li>
      </ul>

      <h2 style={{ marginTop: 24, fontSize: 18 }}>Opt out</h2>
      <p>
        Deploy with <code>NEXT_PUBLIC_TELEMETRY_DISABLED=true</code> to disable telemetry.
      </p>

      <h2 style={{ marginTop: 24, fontSize: 18 }}>Data sources</h2>
      <p>
        Station data comes from <a href="https://openchargemap.org/" target="_blank" rel="noreferrer">Open Charge Map</a>.
        Please verify availability, access, and pricing on arrival.
      </p>

      <p style={{ marginTop: 24 }}>
        Questions? Contact <a href="mailto:hello@example.com">hello@example.com</a>.
      </p>
    </main>
  );
}
