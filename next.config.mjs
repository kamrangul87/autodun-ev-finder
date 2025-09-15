/**
 * Next.js configuration with PWA support.
 *
 * We leverage the `next-pwa` plugin to automatically generate a
 * service worker and precache assets when building for production.
 * See https://github.com/shadowwalker/next-pwa for details.
 */
// Import the default export from next-pwa.  The CommonJS module does not
// provide named exports, so we destructure the default.  Then call
// nextPwa() with the plugin options to obtain the withPWA higher-order
// function.
import nextPwa from 'next-pwa';

const withPWA = nextPwa({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [],
  buildExcludes: [/middleware-manifest\.json$/],
  // Provide a custom offline page for uncached document requests.  The
  // `fallbacks` option defines which routes should fall back when the
  // service worker cannot retrieve a resource from the cache or network.
  fallbacks: {
    document: '/offline',
  },
});

const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  async redirects() {
    return [
      { source: '/', destination: '/ev', permanent: false },
    ];
  },
};

export default withPWA(nextConfig);