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
        {/* SEO – sitewide */}
        <meta name="robots" content="index, follow" />
        <meta property="og:site_name" content="Autodun EV Finder" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Autodun EV Finder - Find EV Charging Stations UK" />
        <meta property="og:description" content="Find EV charging stations across the UK. Browse 30,000+ charge points by location, connector type and AI suitability score. Free EV charging map." />
        <meta property="og:url" content="https://ev.autodun.com/" />
        <link rel="canonical" href="https://ev.autodun.com/" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
