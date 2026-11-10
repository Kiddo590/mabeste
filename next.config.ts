import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "chupachap.co.ke" },
      { protocol: "https", hostname: "ik.imagekit.io" },
      { protocol: "https", hostname: "jayswines.com" },
      {
        protocol: "https",
        hostname: "fwpxrbgpjlhsqyqbpyqx.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
