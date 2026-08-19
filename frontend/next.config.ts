import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle with only the dependencies it uses, so
  // the runtime image needs neither node_modules nor a package manager.
  output: "standalone",
};

export default nextConfig;
