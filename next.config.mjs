// next.config.mjs
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable static export for Leaflet pages
  output: 'standalone',
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        // Swap browser-only libs for a harmless stub in the server bundle
        leaflet: path.resolve(__dirname, 'lib/leaflet-server-stub.js'),
        'leaflet.heat': path.resolve(__dirname, 'lib/leaflet-server-stub.js'),
        'leaflet/dist/images': path.resolve(__dirname, 'node_modules/leaflet/dist/images'),
      };
    }
    config.module.rules.push({
      test: /\.(png|jpe?g|gif|svg)$/i,
      type: 'asset/resource',
    });
    return config;
  },
};

export default nextConfig;
