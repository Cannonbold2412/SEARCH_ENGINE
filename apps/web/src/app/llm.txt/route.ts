import { PUBLIC_DOC_PAGES } from "@/lib/public-docs-registry";
import { SUPPORT_EMAIL, absoluteUrl, getSiteOrigin } from "@/lib/site";

export function GET() {
  const origin = getSiteOrigin();
  const lines: string[] = [
    "# CONXA",
    `Site: ${origin}`,
    `Contact: ${SUPPORT_EMAIL}`,
    "",
    "CONXA helps people capture professional experience in structured profiles and discover others through natural-language search, with short explanations beside each suggestion so results stay readable.",
    "",
    `Sitemap: ${absoluteUrl("/sitemap.xml")}`,
    `Manifest (JSON): ${absoluteUrl("/llm/manifest.json")}`,
    "",
    "## Pages",
    ...PUBLIC_DOC_PAGES.map((p) => `- ${absoluteUrl(p.path)} — ${p.title}. ${p.summary}`),
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
