import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";

export const metadata: Metadata = {
  title: "How the product fits together | CONXA Documentation",
  description:
    "User-facing map of CONXA: home, builder, search, results, inbox, credits, and settings—how you move between them while using the app.",
  alternates: { canonical: "/docs/architecture" },
};

export default function DocsProductMapPage() {
  return (
    <DocsChrome
      title="How the product fits together"
      description="This is a map of main areas as you experience them in the browser—not a technical architecture diagram."
    >
        <p className="text-muted-foreground">
          Think of CONXA as a small set of places you visit repeatedly. Each area has a job; together they cover building a profile, finding people,
          and managing account-level choices.
        </p>

        <section className="space-y-3" id="home-and-entry">
          <h2 className="font-display text-xl font-semibold">Home and entry points</h2>
          <p className="text-muted-foreground">
            After sign-in, the home experience orients you toward the two big jobs: refining how you show up to others and running searches. Entry
            points are labeled so you can jump into the builder, open search, or resume something you started earlier.
          </p>
        </section>

        <section className="space-y-3" id="builder">
          <h2 className="font-display text-xl font-semibold">Builder</h2>
          <p className="text-muted-foreground">
            The builder is where Experience Cards are created and updated. It combines structured fields with conversational assistance so you are
            not starting from a blank page. When you leave, your work is saved according to the normal save behavior shown in the UI.
          </p>
        </section>

        <section className="space-y-3" id="search-and-results">
          <h2 className="font-display text-xl font-semibold">Search and results</h2>
          <p className="text-muted-foreground">
            Search is where you describe a need in language you already use at work. Results show people cards with explanations so you can compare
            candidates quickly. From a result, you can move into deeper profile views or follow-up actions offered for your account.
          </p>
        </section>

        <section className="space-y-3" id="inbox">
          <h2 className="font-display text-xl font-semibold">Inbox and conversations</h2>
          <p className="text-muted-foreground">
            When messaging or conversation features are available, the inbox is where threads accumulate. It sits beside search in the mental model:
            search finds people; inbox continues the relationship after the first contact.
          </p>
        </section>

        <section className="space-y-3" id="credits-settings">
          <h2 className="font-display text-xl font-semibold">Credits, profile, and settings</h2>
          <p className="text-muted-foreground">
            Credits reflect usage tied to paid or limited actions—your balance and explanations live on the credits experience. Profile and
            settings gather account-level choices such as language, security-related options exposed in the product, and links to legal documents.
          </p>
          <p className="text-muted-foreground">
            For definitions of terms used here, see{" "}
            <Link href="/docs/concepts" className="text-primary hover:underline">
              Key concepts
            </Link>
            .
          </p>
        </section>
      </DocsChrome>
  );
}
