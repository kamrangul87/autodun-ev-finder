import Link from 'next/link';
export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily:'ui-sans-serif, system-ui' }}>
      <h1>Autodun EV Map</h1>
      <p>Go to the <Link href="/model1-heatmap">EV Heatmap</Link> or <Link href="/debug/data">Debug Data</Link>.</p>
    </main>
  );
}
