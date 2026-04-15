import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";

export const metadata: Metadata = {
  title: "Key concepts | CONXA Documentation",
  description:
    "Definitions for Experience Cards, natural-language search, match explanations, credits, viewer language, and visibility—as used in the CONXA app.",
  alternates: { canonical: "/docs/concepts" },
};

export default function DocsConceptsPage() {
  return (
    <DocsChrome
      title="Key concepts"
      description="Plain-language meanings for words you will see across CONXA. Each concept links to a short knowledge article when you want more depth."
    >
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Experience Card</h2>
          <p className="text-muted-foreground">
            A structured profile of your professional experience—roles, impact, and supporting detail—meant to be read by another person in minutes.
            You control drafts and when a card is ready to be discoverable.
          </p>
          <p>
            <Link href="/knowledge/concept-1" className="text-primary hover:underline text-sm">
              Read the knowledge article →
            </Link>
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Natural-language search</h2>
          <p className="text-muted-foreground">
            A search where you describe who you need in everyday sentences instead of assembling rigid filters. Results are ranked for usefulness to
            your stated need.
          </p>
          <p>
            <Link href="/knowledge/concept-2" className="text-primary hover:underline text-sm">
              Read the knowledge article →
            </Link>
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Match explanations</h2>
          <p className="text-muted-foreground">
            Short lines of text shown with a search result so you can see why someone was suggested relative to your query. They are written for
            quick scanning, not as a full biography.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Credits</h2>
          <p className="text-muted-foreground">
            An in-app balance that may decrease when you use certain paid or limited features. The credits screen shows your current balance and any
            messages about how usage works for your account.
          </p>
          <p>
            <Link href="/knowledge/concept-3" className="text-primary hover:underline text-sm">
              Read the knowledge article →
            </Link>
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Viewer language</h2>
          <p className="text-muted-foreground">
            A preference that affects parts of the interface and some content shown to you. It does not change facts about another person’s
            experience; it changes how certain strings are presented when translations are available.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Visibility (discovery)</h2>
          <p className="text-muted-foreground">
            Rules you use to decide whether a finished card should appear for other people’s searches. Work in progress stays private until you
            choose otherwise, according to the controls in the builder.
          </p>
        </section>
      </DocsChrome>
  );
}
