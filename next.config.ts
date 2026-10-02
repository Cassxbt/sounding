import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Route handlers read frozen fixtures from disk at runtime; tracing cannot see dynamic paths.
  outputFileTracingIncludes: { "/api/*": ["./fixtures/**/*"] },
};

export default nextConfig;
