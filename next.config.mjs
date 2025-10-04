// next.config.mjs
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        // Swap browser-only libs for a harmless stub in the server bundle
        leaflet: path.resolve(__dirname, 'lib/leaflet-server-stub.js'),
        'leaflet.heat': path.resolve(__dirname, 'lib/leaflet-server-stub.js'),
      };
    }
    return config;
  },
};

export default nextConfig;
