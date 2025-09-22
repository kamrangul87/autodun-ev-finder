// app/layout.tsx
import "leaflet/dist/leaflet.css";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Autodun — EV Charging Finder",
  description:
    "Find EV charging stations in the UK by postcode or your current location.",
  icons: { icon: "/favicon.ico" },
  metadataBase: new URL("https://autodun.com"),
  alternates: { canonical: "https://autodun.com" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Autodun — EV Charging Finder",
    description: "Find EV chargers near you fast.",
    type: "website",
    url: "https://autodun.com",
  },
  // PWA removed: no `manifest`, no `appleWebApp`
};

export const viewport: Viewport = {
  // Optional: toolbar/status bar color in mobile browsers
  themeColor: "#38bdf8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
