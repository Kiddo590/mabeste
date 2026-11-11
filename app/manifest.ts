import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mabeshte POS",
    short_name: "Mabeshte",
    description: "Point of sale for Mabeshte",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2654e0",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
