import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";

export const metadata: Metadata = {
  title: "Guides | CONXA",
  description: "Step-by-step guides for CONXA: getting started, basic setup, and advanced usage for builders and searchers.",
  alternates: { canonical: "/guides" },
};

const GUIDES = [
  { href: "/guides/getting-started", title: "Getting started", blurb: "First session after sign-up—where to click and what to finish." },
  { href: "/guides/basic-setup", title: "Basic setup", blurb: "Language, credits awareness, and keeping your card accurate." },
  { href: "/guides/advanced-usage", title: "Advanced usage", blurb: "Voice with chat, iterating cards, searches from home, inbox habits." },
] as const;

export default function GuidesIndexPage() {
  return (
    <DocsChrome
      title="Guides"
      description="Practical walkthroughs. Pair these with the documentation overview when you want context, or jump straight to a task."
    >
      <ul className="space-y-6 text-muted-foreground">
        {GUIDES.map((g) => (
          <li key={g.href}>
            <Link href={g.href} className="font-display text-lg font-semibold text-foreground hover:text-primary hover:underline">
              {g.title}
            </Link>
            <p className="mt-1">{g.blurb}</p>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        Background reading:{" "}
        <Link href="/docs/overview" className="text-primary hover:underline">
          Documentation overview
        </Link>
        .
      </p>
    </DocsChrome>
  );
}
