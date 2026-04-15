import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";
import { JsonLd } from "@/components/docs/json-ld";
import { SUPPORT_EMAIL, absoluteUrl, getSiteOrigin } from "@/lib/site";

export const metadata: Metadata = {
  title: "General FAQ | CONXA",
  description:
    "General questions about CONXA: what it is for, accounts, languages, credits, Experience Cards, and search results.",
  alternates: { canonical: "/faq/general" },
};

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "What is CONXA for?",
    answer:
      "CONXA helps you express professional experience in a structured card and helps others find you—or helps you find them—with natural-language search and short explanations beside each suggestion.",
  },
  {
    question: "Who should create an Experience Card?",
    answer:
      "Anyone who wants their background understood quickly by another human, especially if you expect to be discovered for projects, hiring pipelines, or partnerships.",
  },
  {
    question: "Do I pay to keep an account?",
    answer:
      "Billing rules depend on your plan and what the product shows in your account. The credits screen explains balances and any usage-based charges that apply to you.",
  },
  {
    question: "What does viewer language change?",
    answer:
      "It changes how parts of the interface and some translated content appear to you. It does not fabricate experience on your behalf and does not replace another person’s own wording where translation is unavailable.",
  },
  {
    question: "Why do search results include short explanations?",
    answer:
      "Explanations make scanning easier. They summarize why someone might match your request so you can open full profiles selectively.",
  },
  {
    question: "Can I keep my card private while I draft?",
    answer:
      "Yes. Use the visibility controls in the builder until you are ready for discovery. Work in progress should not appear to searchers until you choose otherwise.",
  },
  {
    question: "Where are Terms and Privacy?",
    answer: `They live at ${absoluteUrl("/terms")} and ${absoluteUrl("/privacy")}. Contact support at ${SUPPORT_EMAIL} if you need clarification.`,
  },
];

function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export default function FaqGeneralPage() {
  return (
    <>
      <JsonLd data={faqJsonLd()} />
      <DocsChrome
        title="General FAQ"
        description="Straight answers about everyday CONXA usage. For fixes when something breaks, see Troubleshooting."
      >
        <p className="text-muted-foreground">
          More context:{" "}
          <Link href="/docs/overview" className="text-primary hover:underline">
            Overview
          </Link>
          ,{" "}
          <Link href="/docs/concepts" className="text-primary hover:underline">
            Key concepts
          </Link>
          .
        </p>
        <div className="space-y-10">
          {FAQ_ITEMS.map((item) => (
            <section key={item.question} className="space-y-2">
              <h2 className="font-display text-lg font-semibold text-foreground">{item.question}</h2>
              <p className="text-muted-foreground">{item.answer}</p>
            </section>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Site:{" "}
          <a href={getSiteOrigin()} className="text-primary hover:underline">
            {getSiteOrigin()}
          </a>
        </p>
      </DocsChrome>
    </>
  );
}
