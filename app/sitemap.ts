import { readFileSync } from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { PRIVACY_UPDATED, SITE_URL } from "@/lib/site";

/** The date of the newest release in CHANGELOG.md: the last time the home page changed */
function released(): string | undefined {
  const log = readFileSync(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
  return /^## \[[^\]]+\] — (\d{4}-\d{2}-\d{2})/m.exec(log)?.[1];
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, lastModified: released(), changeFrequency: "monthly", priority: 1 },
    // The Android app's privacy policy, the address its Google Play listing links to
    {
      url: `${SITE_URL}/android/privacy`,
      lastModified: PRIVACY_UPDATED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
