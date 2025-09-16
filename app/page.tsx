"use client";

// Root page for the application.  The legacy heatmap is implemented as a
// client component under the `pages` directory.  To expose it via the
// app router (which uses files under `app/`), we import the default
// export from that module and render it here.  This ensures that
// navigating to `/` displays the interactive map rather than a 404.

import Model1HeatmapPage from '../pages/model1-heatmap';

export default function HomePage() {
  return <Model1HeatmapPage />;
}