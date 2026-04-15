import { PUBLIC_DOC_PAGES } from "@/lib/public-docs-registry";
import { SUPPORT_EMAIL, absoluteUrl, getSiteOrigin } from "@/lib/site";

export function GET() {
  const body = {
    site: getSiteOrigin(),
    site_name: "CONXA",
    contact: SUPPORT_EMAIL,
    sitemap: absoluteUrl("/sitemap.xml"),
    llm_txt: absoluteUrl("/llm.txt"),
    pages: PUBLIC_DOC_PAGES.map((p) => ({
      url: absoluteUrl(p.path),
      title: p.title,
      summary: p.summary,
      section: p.section,
    })),
  };

  return Response.json(body, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
