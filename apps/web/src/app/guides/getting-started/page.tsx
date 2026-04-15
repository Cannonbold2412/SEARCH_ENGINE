import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";

export const metadata: Metadata = {
  title: "Getting started | CONXA Guides",
  description:
    "First steps on CONXA after sign-up: complete onboarding, open the builder or search, and save a first version of your Experience Card.",
  alternates: { canonical: "/guides/getting-started" },
};

const TOC = [
  { href: "#onboarding", label: "Finish onboarding" },
  { href: "#first-card", label: "Start your Experience Card" },
  { href: "#first-search", label: "Try a search when you are ready" },
] as const;

export default function GettingStartedPage() {
  return (
    <DocsChrome
      title="Getting started"
      description="A concise checklist for your first session. Skip steps you have already completed—the app remembers your progress."
      toc={[...TOC]}
    >
        <section className="space-y-3" id="onboarding">
          <h2 className="font-display text-xl font-semibold">Finish onboarding</h2>
          <p className="text-muted-foreground">
            Work through language selection and any profile prompts presented to you. These choices tune how copy appears to you and how some
            results are presented when translations exist for your viewer language.
          </p>
          <p className="text-muted-foreground">
            If you are unsure about a field, save the minimum honest answer—you can refine later in settings or the builder.
          </p>
        </section>

        <section className="space-y-3" id="first-card">
          <h2 className="font-display text-xl font-semibold">Start your Experience Card</h2>
          <p className="text-muted-foreground">
            Open the builder from the home experience. Add one role you are proud of: company or context, what you did, and a measurable outcome if
            you have one. Use the conversational panel if it helps you phrase impact clearly.
          </p>
          <p className="text-muted-foreground">
            Leave visibility in a draft-friendly state until you are comfortable being discoverable; the builder surfaces this choice where it
            applies.
          </p>
        </section>

        <section className="space-y-3" id="first-search">
          <h2 className="font-display text-xl font-semibold">Try a search when you are ready</h2>
          <p className="text-muted-foreground">
            From home, describe a person you would realistically need on a project—level, domain, and a constraint or two. Read the explanations
            beside results before opening full profiles. Notice how credits change only when the product says a charge applies.
          </p>
          <p className="text-muted-foreground">
            Next:{" "}
            <Link href="/guides/basic-setup" className="text-primary hover:underline">
              Basic setup
            </Link>{" "}
            for ongoing habits, or{" "}
            <Link href="/faq/general" className="text-primary hover:underline">
              General FAQ
            </Link>{" "}
            for quick answers.
          </p>
        </section>
      </DocsChrome>
  );
}
