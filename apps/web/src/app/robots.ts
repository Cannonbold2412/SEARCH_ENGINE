import type { MetadataRoute } from "next";
import { absoluteUrl, getSiteOrigin } from "@/lib/site";

/**
 * Crawler policy: allow full public site (including documentation and LEO surfaces).
 * AI crawlers (e.g. GPTBot, Google-Extended) follow the same rules unless you add a specific disallow later.
 * Product policy: permissive for public marketing and docs; authenticated app routes are not listed in sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  const host = new URL(getSiteOrigin()).host;
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host,
  };
}
