import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // tsc --noEmit is run as a separate CI step before `next build`.
    // This prevents the ~10 minute hang from Next.js's redundant internal
    // tsc pass in this environment. Re-enable when build-time tsc is fast.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
