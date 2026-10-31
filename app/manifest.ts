import type { MetadataRoute } from "next";
import { SITE_COLOR, SITE_DESCRIPTION } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MANUS",
    short_name: "MANUS",
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "en",
    categories: ["music", "entertainment"],
    background_color: SITE_COLOR,
    theme_color: SITE_COLOR,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // Full-bleed, with the four beams and the wave inside the middle 80% so any mask shape keeps them whole
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // What an install sheet shows (scripts/pwa-screenshots.mjs makes them from a production build)
    screenshots: [
      { src: "/pwa/screen-wide.webp", sizes: "1440x900", type: "image/webp", form_factor: "wide", label: "The stage, the beam keys and the deck on a laptop" },
      { src: "/pwa/screen-narrow.webp", sizes: "780x1688", type: "image/webp", form_factor: "narrow", label: "MANUS on a phone" },
    ],
  };
}
