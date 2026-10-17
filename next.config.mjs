import path from "node:path";

const nextConfig = {
  serverExternalPackages: ["@whiskeysockets/baileys"],
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(process.cwd()),
    };
    return config;
  },
};

export default nextConfig;
