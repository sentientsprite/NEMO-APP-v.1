import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@nemo/agents", "@nemo/orchestrator", "@nemo/memory"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
