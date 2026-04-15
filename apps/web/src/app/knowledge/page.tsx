import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";

export const metadata: Metadata = {
  title: "Knowledge base | CONXA",
  description: "Short definitions of Experience Cards, search with match explanations, and credits on CONXA.",
  alternates: { canonical: "/knowledge" },
};

const ARTICLES = [
  { href: "/knowledge/concept-1", title: "Experience Cards", blurb: "What a card is, drafts, and discovery visibility." },
  { href: "/knowledge/concept-2", title: "Search and match explanations", blurb: "Natural-language queries and the lines beside each result." },
  { href: "/knowledge/concept-3", title: "Credits and contact flows", blurb: "Balances you see and flows that involve contact details." },
] as const;

export default function KnowledgeIndexPage() {
  return (
    <DocsChrome
      title="Knowledge base"
      description="Atomic articles—each page answers one topic in a few minutes of reading."
    >
      <ul className="space-y-6 text-muted-foreground">
        {ARTICLES.map((a) => (
          <li key={a.href}>
            <Link href={a.href} className="font-display text-lg font-semibold text-foreground hover:text-primary hover:underline">
              {a.title}
            </Link>
            <p className="mt-1">{a.blurb}</p>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        Broader context lives in{" "}
        <Link href="/docs/concepts" className="text-primary hover:underline">
          Key concepts
        </Link>
        .
      </p>
    </DocsChrome>
  );
}
