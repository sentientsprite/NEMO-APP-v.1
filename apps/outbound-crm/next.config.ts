import type { NextConfig } from "next";

/** Lock Next tracing to this app (monorepo / multiple lockfiles on disk). */
const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
