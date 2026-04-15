import type { MetadataRoute } from "next";
import { PUBLIC_DOC_PAGES } from "@/lib/public-docs-registry";
import { getSiteOrigin } from "@/lib/site";

/** Public marketing/auth entry paths not duplicated in the docs registry. */
const EXTRA_PATHS: { path: string; changeFrequency: MetadataRoute.Sitemap[0]["changeFrequency"]; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/login", changeFrequency: "monthly", priority: 0.6 },
  { path: "/signup", changeFrequency: "monthly", priority: 0.65 },
];

function priorityForDocPath(path: string): number {
  if (path === "/docs/overview") return 0.95;
  if (path === "/docs" || path === "/guides" || path === "/knowledge" || path === "/faq") return 0.88;
  if (path.startsWith("/docs")) return 0.85;
  if (path.startsWith("/guides")) return 0.8;
  if (path.startsWith("/knowledge")) return 0.78;
  if (path.startsWith("/faq")) return 0.76;
  return 0.65;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteOrigin();
  const extra = EXTRA_PATHS.map((e) => ({
    url: `${base}${e.path}`,
    lastModified: new Date(),
    changeFrequency: e.changeFrequency,
    priority: e.priority,
  }));

  const docs = PUBLIC_DOC_PAGES.map((p) => ({
    url: `${base}${p.path}`,
    lastModified: new Date(),
    changeFrequency: (p.section === "faq" ? "weekly" : "monthly") as MetadataRoute.Sitemap[0]["changeFrequency"],
    priority: priorityForDocPath(p.path),
  }));

  return [...extra, ...docs];
}
