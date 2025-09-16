"use client";

// This file exposes the EV heatmap page under the app router.  It
// simply re-exports the existing implementation from the pages
// directory.  Using a client component wrapper here ensures that
// browser-only APIs (e.g. Leaflet) are initialised on the client.

import Model1HeatmapPage from '../../pages/model1-heatmap';

export default function AppHeatmapPage() {
  return <Model1HeatmapPage />;
}