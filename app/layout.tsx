import 'leaflet/dist/leaflet.css';
import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

/**
 * Global metadata for the application.  In addition to the title and
 * description, we specify a web app manifest, theme colour and iOS
 * configuration.  These additions are required to make the app
 * installable as a Progressive Web App (PWA) and ensure the browser
 * chrome matches the Autodun brand colours when installed.
 */
export const metadata: Metadata = {
  title: "Autodun — EV Charging Finder",
  description: "Find EV charging stations in the UK by postcode or your current location.",
  icons: { icon: "/favicon.ico" },
  metadataBase: new URL("https://autodun.com"),
  alternates: { canonical: "https://autodun.com" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Autodun — EV Charging Finder",
    description: "Find EV chargers near you fast.",
    type: "website",
  },
  // Point Next.js at our manifest so that the correct link tag is
  // generated in the document head.  Without this the app cannot be
  // installed to a device home screen.
  manifest: "/manifest.json",
  // Define the browser UI colour to match our brand.  Many mobile
  // browsers use this value to colour the status bar and title bar
  // when the site is launched from the home screen.
  themeColor: "#38bdf8",
  // Configure Apple devices for a stand‑alone experience.  The
  // `title` here controls the label under the icon on the home
  // screen.  The statusBarStyle default yields dark text on light
  // backgrounds, which pairs well with the Autodun colour palette.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Autodun",
  },
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