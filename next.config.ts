import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The automated tests run a second dev server beside the hand-testing one;
  // each needs its own build directory (scripts/test-dev.sh sets this).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Pin the Turbopack workspace root. Without this, Next walks up looking for a
  // lockfile and can land outside the repo, which breaks RSC manifest paths.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
