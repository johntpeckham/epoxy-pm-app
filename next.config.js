// Epoxy PM App - Next.js configuration
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      // Never cache auth-related routes or API calls
      urlPattern: /^https?:\/\/.*\/(login|auth|forgot-password|reset-password|api\/auth)(\/.*)?$/,
      handler: "NetworkOnly",
    },
    {
      // Never cache Supabase auth endpoints
      urlPattern: /^https?:\/\/.*\.supabase\.co\/auth\/.*/,
      handler: "NetworkOnly",
    },
    {
      // Navigation requests (HTML pages) — always go to network first
      // This prevents the SW from serving a cached login redirect on hard refresh
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "pages",
        networkTimeoutSeconds: 5,
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  turbopack: {},
};

module.exports = withPWA(nextConfig);
