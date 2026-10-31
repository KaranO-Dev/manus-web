export const SITE_URL = "https://manus.karano.me";

export const SITE_TITLE = "MANUS: pinch the light to play";

export const SITE_DESCRIPTION =
  "A hand-tracked laser-harp synth that runs in your browser. Play it with your webcam or a mouse. Camera frames stay on your device.";

export const SITE_COLOR = "#111113";

/** The author's Person node on karano.me (PERSON_ID in its lib/seo.ts), so search ties MANUS to the same person */
export const AUTHOR_PERSON_ID = "https://karano.me/#person";

/** A JSON-LD script body, with < escaped so no string in it can close the script tag */
export function jsonLd(data: Record<string, unknown>) {
  return { __html: JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c") };
}
