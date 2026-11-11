import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Crawlers that gather pages to train AI models, by the names their makers publish: the same list
// as karano.me's app/robots.ts. They may not come in at all. Search engines, and the assistants
// that fetch a page because someone asked them (OAI-SearchBot, ChatGPT-User, Claude-User,
// Claude-SearchBot, PerplexityBot, Perplexity-User), are unaffected
const AI_TRAINING = [
  "GPTBot", // OpenAI
  "ClaudeBot", // Anthropic
  "anthropic-ai",
  "Google-Extended", // Gemini; Google Search is untouched
  "Applebot-Extended", // Apple Intelligence; Applebot's search is untouched
  "CCBot", // Common Crawl
  "meta-externalagent", // Meta
  "FacebookBot",
  "Bytespider", // ByteDance
  "Amazonbot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "AI2Bot", // the Allen Institute
  "Diffbot",
  "ImagesiftBot",
  "omgili",
  "omgilibot",
  "Webzio-Extended",
  "Timpibot",
  "PanguBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: AI_TRAINING, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
