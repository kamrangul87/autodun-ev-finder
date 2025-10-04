// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent any server import from evaluating real browser-only libs
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        leaflet: require('path').resolve(__dirname, 'lib/leaflet-server-stub.ts'),
        'leaflet.heat': require('path').resolve(__dirname, 'lib/leaflet-server-stub.ts'),
      };
    }
    return config;
  },
  // Ensure we do not attempt to pre-render the heatmap page
  // (keeps ISR/SSG elsewhere intact)
  experimental: {
    // no special flags needed here, but keep block in case you add others later
  },
};

export default nextConfig;
