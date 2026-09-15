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
};

export default nextConfig;
