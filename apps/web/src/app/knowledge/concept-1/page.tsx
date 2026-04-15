import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";

export const metadata: Metadata = {
  title: "Experience Cards | CONXA Knowledge",
  description:
    "Definition of CONXA Experience Cards: structured professional profiles, drafts, and visibility for appearing in others’ search results.",
  alternates: { canonical: "/knowledge/concept-1" },
};

export default function KnowledgeConcept1Page() {
  return (
    <DocsChrome
      title="Experience Cards"
      description="An Experience Card is a structured profile of your work—written for humans first, discoverable on your terms."
    >
        <p className="font-medium text-foreground">
          One-line definition: a living profile that captures how you work, not only where you worked, with controls for when it can appear to
          searchers.
        </p>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">What belongs on a card</h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>Roles or chapters of your career with clear scope.</li>
            <li>Outcomes you influenced, phrased so another professional can verify the claim in conversation.</li>
            <li>Optional supporting detail such as tools, domains, or leadership moments that help a searcher picture you on their problem.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Drafts versus ready states</h2>
          <p className="text-muted-foreground">
            While you are still experimenting with wording, keep the card in a state the product treats as work in progress. When you are satisfied
            and the product offers a discovery or visibility control, use it intentionally—searchers should only see material you stand behind.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">What searchers see</h2>
          <p className="text-muted-foreground">
            Searchers encounter summaries and explanations derived from the fields you approved for discovery. They still need to respect unlock and
            messaging rules before they see sensitive contact information.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Related</h2>
          <p className="text-muted-foreground">
            <Link href="/guides/getting-started" className="text-primary hover:underline">
              Getting started
            </Link>
            ,{" "}
            <Link href="/docs/concepts" className="text-primary hover:underline">
              Key concepts
            </Link>
            .
          </p>
        </section>
      </DocsChrome>
  );
}
