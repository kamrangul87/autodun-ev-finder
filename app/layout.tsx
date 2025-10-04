import './globals.css';
import React from 'react';
export const metadata = { title: 'Autodun EV Finder — London', description: 'Live EV stations across Greater London.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
