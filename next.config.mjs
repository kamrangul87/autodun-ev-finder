// next.config.mjs
/**
 * Next.js configuration (PWA temporarily disabled while we stabilise).
 * If you want to re-enable the service worker later, change `disable: true`
 * to `disable: process.env.NODE_ENV === 'development'`.
 */

import nextPwa from 'next-pwa';

const withPWA = nextPwa({
  dest: 'public',
  disable: true,            // ⟵ TEMP: turn off SW on all envs to avoid stale bundles
  register: false,
  skipWaiting: false,
  runtimeCaching: [],
  buildExcludes: [/middleware-manifest\.json$/],
  fallbacks: { document: '/offline' },
});

const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  async redirects() {
    return [
      // keep old /ev bookmark working
      { source: '/ev', destination: '/model1-heatmap', permanent: false },
    ];
  },
};

export default withPWA(nextConfig);
