import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the Turbopack workspace root. Without this, Next walks up looking for a
  // lockfile and can land outside the repo, which breaks RSC manifest paths.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
