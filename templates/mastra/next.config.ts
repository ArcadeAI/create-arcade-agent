import type { NextConfig } from "next";

// Derive app URL from PORT so users only need to set one env var.
// Override NEXT_PUBLIC_APP_URL and BETTER_AUTH_URL explicitly when needed (e.g. ngrok).
const port = process.env.PORT || "8765";
const baseUrl = `http://localhost:${port}`;

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@mastra/core"],
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || baseUrl,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || baseUrl,
  },
};

export default nextConfig;
