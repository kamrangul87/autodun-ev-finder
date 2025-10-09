import "leaflet/dist/leaflet.css";
import "../styles/globals.css";
import type { AppProps } from 'next/app';

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
