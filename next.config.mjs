/**
 * Next.js configuration with PWA support.
 *
 * We leverage the `next-pwa` plugin to automatically generate a
 * service worker and precache assets when building for production.
 * See https://github.com/shadowwalker/next-pwa for details.
 */
import { withPWA } from 'next-pwa';

const nextConfig = withPWA({
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  // Make the EV Finder the homepage
  async redirects() {
    return [
      { source: '/', destination: '/ev', permanent: false },
    ];
  },
  // PWA configuration
  pwa: {
    dest: 'public',
    // Disable the service worker in development so that hot reloads
    // don’t get cached and offline behaviour doesn’t interfere with
    // development. During production builds the service worker will
    // automatically be generated and registered.
    disable: process.env.NODE_ENV === 'development',
    // Provide an offline fallback page. When a route is not cached
    // the service worker will fallback to `/offline`.
    runtimeCaching: [],
    buildExcludes: [/middleware-manifest\.json$/],
    // When the service worker cannot find a cached page it will
    // serve our custom offline page.  This path corresponds to the
    // offline page created under app/offline/page.tsx.
    fallback: {
      document: '/offline'
    },
    fallbacks: {
      // When the user navigates to a route that hasn’t been precached,
      // serve the offline page.
      document: '/offline',
    },
  },
});

export default nextConfig;