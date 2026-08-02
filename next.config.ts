import type { NextConfig } from "next";

// NEXT_PUBLIC_* is inlined at build time, so a Vercel build with this variable
// missing would silently bake in lib/api.ts's localhost fallback and ship a
// site whose every request fails. Fail the build instead — the fallback is for
// local development, where `next dev` runs without VERCEL set.
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
