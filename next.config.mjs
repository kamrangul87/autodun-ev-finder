/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },

  // Make the EV Finder the homepage
  async redirects() {
    return [
      { source: '/', destination: '/ev', permanent: false },
    ];
  },
};

export default nextConfig;
