import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions default to a 1 MB request body, well under what a
    // real legacy .xls import needs — the OTOLARYN pacientes.xls dump
    // alone is 14 MB. Both import wizards (Pacientes, Consultas) send the
    // whole file through a Server Action, so this has to be raised for
    // that migration to work at all, not just as a nice-to-have.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  // Baseline browser hardening for every route. frame-ancestors 'self'
  // (not 'none') so the app can still frame its own pages, and no
  // script-src policy yet: Next's inline bootstrap scripts need a
  // nonce-based CSP, which is a separate change.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
