// next.config.mjs — PWA fully removed
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  async redirects() {
    return [
      // keep your legacy /ev bookmark redirect
      { source: '/ev', destination: '/model1-heatmap', permanent: false },
    ];
  },
};

export default nextConfig;
