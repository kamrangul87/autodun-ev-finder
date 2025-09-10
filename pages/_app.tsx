// pages/_app.tsx
import type { AppProps } from 'next/app';
import '../app/globals.css';       // Tailwind/global styles
import 'leaflet/dist/leaflet.css'; // Leaflet styles

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
