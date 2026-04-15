import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";
import { JsonLd } from "@/components/docs/json-ld";
import { SUPPORT_EMAIL, absoluteUrl, getSiteOrigin } from "@/lib/site";

export const metadata: Metadata = {
  title: "Overview | CONXA Documentation",
  description:
    "CONXA helps people turn experience into structured profiles and discover others through natural-language search—with clear, short explanations for each suggestion.",
  alternates: { canonical: "/docs/overview" },
};

export default function DocsOverviewPage() {
  const origin = getSiteOrigin();
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "CONXA",
        url: origin,
        description:
          "CONXA is a platform for structured professional experience profiles and natural-language people search with match explanations.",
        email: SUPPORT_EMAIL,
      },
      {
        "@type": "WebSite",
        name: "CONXA",
        url: origin,
        description: "Every experience, searchable—profiles, search, and conversations in one product experience.",
        publisher: { "@type": "Organization", name: "CONXA", url: origin },
      },
    ],
  };

  return (
    <>
      <JsonLd data={orgJsonLd} />
      <DocsChrome
        title="Overview"
        description="CONXA is for people who want their experience to be understood at a glance—and for teams who search in everyday language instead of rigid filters."
      >
        <p className="text-muted-foreground">
          This page summarizes what you can expect as a user. It does not describe internal systems or vendor choices.
        </p>

        <section className="space-y-3" id="what-conxa-does">
          <h2 className="font-display text-xl font-semibold">What CONXA does</h2>
          <p className="text-muted-foreground">
            You build an <strong className="text-foreground">Experience Card</strong>: a structured profile of roles, skills, and outcomes
            described in your own words. Searchers describe who they need in plain language. CONXA returns ranked people and shows{" "}
            <strong className="text-foreground">short explanations</strong> so each suggestion is understandable without opening a full CV.
          </p>
          <p className="text-muted-foreground">
            The product also supports <strong className="text-foreground">viewer language</strong> for parts of the experience, so the interface
            and some results can align with a preferred language when that is available in your account settings.
          </p>
        </section>

        <section className="space-y-3" id="who-it-is-for">
          <h2 className="font-display text-xl font-semibold">Who it is for</h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Professionals</strong> who want a living profile that reflects how they actually work—not only
              job titles on a form.
            </li>
            <li>
              <strong className="text-foreground">Searchers</strong> hiring, partnering, or staffing who think in problems and outcomes instead of
              keyword lists.
            </li>
            <li>
              <strong className="text-foreground">Teams</strong> that need a shared place to discover people and follow up through in-product
              conversations when those features are enabled for your workspace.
            </li>
          </ul>
        </section>

        <section className="space-y-3" id="trust-and-control">
          <h2 className="font-display text-xl font-semibold">Trust and control</h2>
          <p className="text-muted-foreground">
            You choose what goes on your card and when it is ready for others to find. Legal terms and privacy practices are documented in the{" "}
            <Link href="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            . For product questions, start with the{" "}
            <Link href="/faq/general" className="text-primary hover:underline">
              FAQ
            </Link>{" "}
            or contact{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section className="space-y-3" id="next-steps">
          <h2 className="font-display text-xl font-semibold">Next steps</h2>
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
            <li>
              <Link href="/docs/how-it-works" className="text-primary hover:underline">
                How it works
              </Link>{" "}
              — follow the journey through the app.
            </li>
            <li>
              <Link href="/docs/concepts" className="text-primary hover:underline">
                Key concepts
              </Link>{" "}
              — vocabulary used in the UI.
            </li>
            <li>
              <Link href="/guides/getting-started" className="text-primary hover:underline">
                Getting started
              </Link>{" "}
              — first actions after sign-up.
            </li>
          </ol>
          <p className="text-sm text-muted-foreground">
            Machine-readable index of these pages:{" "}
            <a href={absoluteUrl("/llm.txt")} className="text-primary hover:underline">
              {absoluteUrl("/llm.txt")}
            </a>
            .
          </p>
        </section>
      </DocsChrome>
    </>
  );
}
