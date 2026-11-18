import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `libsql` ships a native addon; keep it out of the server bundle so Vercel
  // traces the platform-specific binary correctly.
  serverExternalPackages: ["libsql"],
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
