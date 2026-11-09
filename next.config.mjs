/** @type {import('next').NextConfig} */
const nextConfig = {
  // don't fail the CI on lint warnings
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        // JSON API routes are data, not pages. Keep them crawlable so Googlebot
        // can fetch station data when rendering the map, but do not index them.
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },
};
export default nextConfig;
