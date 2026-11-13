import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads the identity cookie and the local database, so the app
  // is fully dynamic; Cache Components is left off to keep that simple.
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
