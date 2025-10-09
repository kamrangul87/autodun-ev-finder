/** @type {import('next').NextConfig} */
const nextConfig = {
  // don't fail the CI on lint warnings
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
