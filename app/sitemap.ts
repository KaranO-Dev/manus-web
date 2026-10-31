import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    // The Android app's privacy policy, the address its Google Play listing links to
    { url: `${SITE_URL}/android/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
