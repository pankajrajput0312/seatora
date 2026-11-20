import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

// Makes Seatora installable ("Add to Home Screen"): opens on the planner, full screen, in the app's dark ink.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name}: NEET PG counselling planner`,
    short_name: siteConfig.name,
    description: siteConfig.description,
    id: "/",
    start_url: "/decide",
    scope: "/",
    display: "standalone",
    background_color: "#0b0e12",
    theme_color: "#0b0e12",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
