/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },

  // ✅ Let the build proceed even if an old ESLint config is present
  eslint: {
    ignoreDuringBuilds: true,
  },

  async redirects() {
    return [
      // keep this so /ev goes to the new page
      { source: '/ev', destination: '/model1-heatmap', permanent: false },
    ];
  },
};

export default nextConfig;
