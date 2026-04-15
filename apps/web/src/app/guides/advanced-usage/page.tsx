import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";

export const metadata: Metadata = {
  title: "Advanced usage | CONXA Guides",
  description:
    "Use voice with chat in the builder, iterate Experience Cards, run natural-language searches from home, and manage inbox follow-ups on CONXA.",
  alternates: { canonical: "/guides/advanced-usage" },
};

const TOC = [
  { href: "#voice", label: "Voice alongside chat" },
  { href: "#iterate", label: "Iterating cards" },
  { href: "#search-home", label: "Search from home" },
  { href: "#inbox", label: "Inbox habits" },
] as const;

export default function AdvancedUsagePage() {
  return (
    <DocsChrome
      title="Advanced usage"
      description="Patterns for people who already completed basic setup and want smoother workflows in the builder, search, and inbox."
      toc={[...TOC]}
    >
        <section className="space-y-3" id="voice">
          <h2 className="font-display text-xl font-semibold">Voice alongside chat</h2>
          <p className="text-muted-foreground">
            When voice is enabled, dictate rough bullet points first, then switch to typing to tighten wording. Short utterances usually produce
            cleaner transcripts than very long monologues. If a transcript misses a nuance, correct it inline so your card stays authoritative.
          </p>
        </section>

        <section className="space-y-3" id="iterate">
          <h2 className="font-display text-xl font-semibold">Iterating cards</h2>
          <p className="text-muted-foreground">
            Treat your card like a release note: each edit should improve clarity for a reader who has sixty seconds. Prefer concrete verbs and
            outcomes over adjectives. When you add a new role, link it to how it changed metrics, delivery risk, or team capability.
          </p>
        </section>

        <section className="space-y-3" id="search-home">
          <h2 className="font-display text-xl font-semibold">Search from home</h2>
          <p className="text-muted-foreground">
            Keep one saved query pattern you reuse—good for hiring managers who interview similar profiles weekly. Adjust only the differentiating
            phrase each time so explanations stay easy to compare across runs.
          </p>
        </section>

        <section className="space-y-3" id="inbox">
          <h2 className="font-display text-xl font-semibold">Inbox habits</h2>
          <p className="text-muted-foreground">
            When conversations are enabled, reply from the thread you started so context stays attached. If a thread is waiting on an unlock or
            contact step, complete that step in the product rather than moving sensitive details to unstructured channels prematurely.
          </p>
          <p className="text-muted-foreground">
            Stuck?{" "}
            <Link href="/faq/troubleshooting" className="text-primary hover:underline">
              Troubleshooting
            </Link>
            .
          </p>
        </section>
      </DocsChrome>
  );
}
