import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Autodun EV Finder',
  description: 'Find EV charging stations across the UK',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  )
}
