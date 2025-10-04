import 'leaflet/dist/leaflet.css';
import './globals.css';
import React from 'react';

export const metadata = {
  title: 'Autodun — EV Map',
  description: 'EV charging map for the UK with heatmap and council overlays.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
