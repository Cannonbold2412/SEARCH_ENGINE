import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";

export const metadata: Metadata = {
  title: "Search and match explanations | CONXA Knowledge",
  description:
    "How natural-language search works on CONXA for users, and what the short explanations beside each search result mean.",
  alternates: { canonical: "/knowledge/concept-2" },
};

export default function KnowledgeConcept2Page() {
  return (
    <DocsChrome
      title="Search and match explanations"
      description="Search is described the way you would brief a teammate; explanations make suggestions legible at a glance."
    >
        <p className="font-medium text-foreground">
          One-line definition: you write what you need in everyday language; CONXA returns people with brief reasons shown next to each name so you
          can triage quickly.
        </p>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Writing a good query</h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>State the outcome you need (“launch a payments integration”) not only a title (“engineer”).</li>
            <li>Add one or two constraints that matter (“remote-friendly”, “regulated industry”).</li>
            <li>Mention seniority in plain words when it matters to you.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">How to read explanations</h2>
          <p className="text-muted-foreground">
            Explanations highlight overlap between your request and what someone chose to publish on their card. They are intentionally short. If an
            explanation looks promising, open the profile for full context; if it looks off, refine your query and run again.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Credits and confirmations</h2>
          <p className="text-muted-foreground">
            Some searches may consume credits. The product surfaces balance changes and confirmations inline—use those moments to decide whether to
            widen or narrow your request before spending more.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Related</h2>
          <p className="text-muted-foreground">
            <Link href="/docs/how-it-works" className="text-primary hover:underline">
              How it works
            </Link>
            ,{" "}
            <Link href="/faq/general" className="text-primary hover:underline">
              General FAQ
            </Link>
            .
          </p>
        </section>
      </DocsChrome>
  );
}
