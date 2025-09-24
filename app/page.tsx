export const viewport = {
  themeColor: '#0b1220',
};
"use client";

// Root page for the application.  The legacy heatmap is implemented as a
// client component under the `pages` directory.  To expose it via the
// app router (which uses files under `app/`), we import the default
// export from that module and render it here.  This ensures that
// navigating to `/` displays the interactive map rather than a 404.

// Import the heatmap page from the app router.  Importing from the
// pages directory is not necessary now that the component lives under
// `app/model1-heatmap/page`.
import Model1HeatmapPage from './model1-heatmap/page';

export default function HomePage() {
  return <Model1HeatmapPage />;
}