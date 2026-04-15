import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";

export const metadata: Metadata = {
  title: "How it works | CONXA Documentation",
  description:
    "End-to-end user journey on CONXA: account, onboarding, Experience Cards, search, results with explanations, credits, and conversations.",
  alternates: { canonical: "/docs/how-it-works" },
};

const TOC = [
  { href: "#account", label: "Account and onboarding" },
  { href: "#cards", label: "Experience Cards" },
  { href: "#search", label: "Search" },
  { href: "#after-search", label: "After search" },
] as const;

export default function DocsHowItWorksPage() {
  return (
    <DocsChrome
      title="How it works"
      description="A user-level walkthrough: what you do in CONXA from the first visit to follow-up—without implementation detail."
      toc={[...TOC]}
    >
        <p className="text-muted-foreground">
          CONXA is designed so builders and searchers can share one product surface. The steps below reflect what you will see in the app; exact
          labels may evolve, but the flow stays the same in spirit.
        </p>

        <section className="space-y-3" id="account">
          <h2 className="font-display text-xl font-semibold">Account and onboarding</h2>
          <p className="text-muted-foreground">
            You create an account and complete onboarding steps such as language preference and basic profile information. Onboarding exists so
            search results, explanations, and parts of the interface can respect choices you make early.
          </p>
          <p className="text-muted-foreground">
            After onboarding, you typically land on an experience that points you toward <strong className="text-foreground">building</strong> a
            card, <strong className="text-foreground">searching</strong>, or both, depending on product configuration when you join.
          </p>
        </section>

        <section className="space-y-3" id="cards">
          <h2 className="font-display text-xl font-semibold">Experience Cards</h2>
          <p className="text-muted-foreground">
            The builder helps you capture roles, impact, and supporting detail in a structured layout. You can work in text and, where enabled, use
            voice so speaking feels as natural as typing. The goal is a card that reads well to another human and stays easy to update.
          </p>
          <p className="text-muted-foreground">
            Cards have a <strong className="text-foreground">visibility</strong> concept you control: until you are ready for discovery, you can
            keep work in progress from appearing in other people’s searches. When you mark a card appropriately for discovery, it can appear for
            relevant queries according to in-product rules.
          </p>
          <p className="text-muted-foreground">
            See also:{" "}
            <Link href="/knowledge/concept-1" className="text-primary hover:underline">
              Experience Cards (knowledge)
            </Link>
            .
          </p>
        </section>

        <section className="space-y-3" id="search">
          <h2 className="font-display text-xl font-semibold">Search</h2>
          <p className="text-muted-foreground">
            Search starts from a natural-language request: you describe the person or background you are looking for the way you would explain it to
            a colleague. CONXA returns a ranked list of people with <strong className="text-foreground">short explanations</strong> attached to
            each result so you can scan why someone was suggested before you dig deeper.
          </p>
          <p className="text-muted-foreground">
            Running a search may consume <strong className="text-foreground">credits</strong> according to what your account shows. The credits
            screen in the app is the source of truth for your balance and any messages about usage.
          </p>
        </section>

        <section className="space-y-3" id="after-search">
          <h2 className="font-display text-xl font-semibold">After search</h2>
          <p className="text-muted-foreground">
            When you find a strong match, you can follow the in-product flows to learn more or reach out, depending on what your organization has
            enabled. Unlocked or contact-related steps are always labeled in the UI so you know when you are sharing or requesting contact
            information.
          </p>
          <p className="text-muted-foreground">
            For practical tips, read{" "}
            <Link href="/guides/advanced-usage" className="text-primary hover:underline">
              Advanced usage
            </Link>{" "}
            and the{" "}
            <Link href="/faq/troubleshooting" className="text-primary hover:underline">
              Troubleshooting FAQ
            </Link>
            .
          </p>
        </section>
      </DocsChrome>
  );
}
