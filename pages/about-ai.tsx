// pages/about-ai.tsx
export default function AboutAI() {
  return (
    <main style={{ maxWidth: 820, margin: '40px auto', padding: '0 16px', lineHeight: 1.6 }}>
      <h1 style={{ marginBottom: 12 }}>About AI Suitability</h1>
      <p>
        AI Suitability estimates how suitable a station may be based on available signals:
        number of connectors, presence of fast DC (CHAdeMO/CCS), power (kW), user rating, and basic
        geo completeness. It’s displayed as a percentage (0–100%) with a simple label.
      </p>

      <ul>
        <li><b>Low:</b> 0–49%</li>
        <li><b>Medium:</b> 50–74%</li>
        <li><b>High:</b> 75–100%</li>
      </ul>

      <p style={{ marginTop: 16 }}>
        This score is an estimate — availability, pricing, and site conditions can change. Always verify on arrival.
      </p>

      <h2 style={{ marginTop: 24, fontSize: 18 }}>Heatmap</h2>
      <p>
        When enabled, the heatmap weights each point by AI Suitability. Brighter clusters generally indicate areas with higher suitability.
      </p>
    </main>
  );
}
