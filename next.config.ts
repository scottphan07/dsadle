import type { NextConfig } from "next";

// NEXT_PUBLIC_* is inlined at build time, so a missing value would bake
// lib/api.ts's localhost fallback into the deploy; VERCEL scopes the guard to
// real builds, leaving the fallback for `next dev`.
if (process.env.VERCEL && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error(
    "NEXT_PUBLIC_API_URL is not set. Add it in the Vercel project settings " +
      "(no trailing slash) and redeploy — it is inlined at build time, so a " +
      "restart will not pick it up.",
  );
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
