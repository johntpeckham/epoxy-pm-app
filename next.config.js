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
      // Navigation requests (HTML pages) — ALWAYS go to network.
      // Never serve cached pages; auth state must come from the server.
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkOnly",
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
  async redirects() {
    return [
      {
        source: "/estimating",
        destination: "/sales/estimating",
        permanent: false,
      },
      {
        source: "/job-takeoff",
        destination: "/sales/estimating",
        permanent: false,
      },
      {
        // Phase 3 rename: legacy /estimates child segment → /proposals.
        // Wildcard :id* covers /new, /{uuid}, and any future nested paths.
        // Query string is preserved automatically by Next.js redirects.
        source: "/sales/estimating/estimates/:id*",
        destination: "/sales/estimating/proposals/:id*",
        permanent: true,
      },
    ];
  },
};

module.exports = withPWA(nextConfig);
