import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Leaflet CSS */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
        {/* Site-wide identifier for Open Graph */}
        <meta property="og:site_name" content="Autodun EV Finder" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
