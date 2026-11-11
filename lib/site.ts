export const SITE_URL = "https://manus.karano.me";

export const SITE_TITLE = "MANUS: pinch the light to play";

export const SITE_DESCRIPTION =
  "A hand-tracked laser-harp synth that runs in your browser. Play it with your webcam or a mouse. Camera frames stay on your device.";

export const SITE_COLOR = "#111113";

/** The author's Person node on karano.me (PERSON_ID in its lib/seo.ts), so search ties MANUS to the same person */
export const AUTHOR_PERSON_ID = "https://karano.me/#person";

/** MANUS's own node in the structured data. karano.me's MANUS case study points its `about` here */
export const APP_ID = `${SITE_URL}/#app`;

/** The day the Android privacy policy's text last changed: its sitemap date. Change it with the text */
export const PRIVACY_UPDATED = "2026-10-27";

/** A JSON-LD script body, with < escaped so no string in it can close the script tag */
export function jsonLd(data: Record<string, unknown>) {
  return { __html: JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c") };
}

/** What MANUS is, for search engines: the home page's structured data, built once */
export const APP_JSON_LD = jsonLd({
  "@type": "WebApplication",
  "@id": APP_ID,
  name: "MANUS",
  url: SITE_URL,
  // The same app on karano.me. When the Android app is on Google Play, its listing goes here too
  sameAs: ["https://karano.me/work/manus"],
  description: SITE_DESCRIPTION,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any (in a web browser)",
  browserRequirements:
    "Requires JavaScript and WebGL 2. A webcam is needed for hand tracking. A mouse and keys work without one.",
  softwareVersion: process.env.NEXT_PUBLIC_MANUS_VERSION,
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  image: `${SITE_URL}/opengraph-image.jpg`,
  author: {
    "@type": "Person",
    "@id": AUTHOR_PERSON_ID,
    name: "Karan Oroumchi",
    url: "https://karano.me",
  },
});
