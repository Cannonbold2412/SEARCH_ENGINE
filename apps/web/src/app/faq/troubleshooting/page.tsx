import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";
import { JsonLd } from "@/components/docs/json-ld";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Troubleshooting | CONXA FAQ",
  description:
    "Fix common CONXA issues: sign-in, email verification, empty search results, builder or voice problems, credits confusion, and how to contact support.",
  alternates: { canonical: "/faq/troubleshooting" },
};

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "I cannot sign in. What should I check?",
    answer:
      "Confirm you are using the same email you registered with, request a new magic link or password reset if the product offers one, and check spam folders. If your organization uses SSO and you are unsure, ask your admin before opening a second account.",
  },
  {
    question: "My email verification link expired.",
    answer:
      "Return to the verification screen from the product and resend the message. Links expire for security; generating a fresh one usually resolves the issue.",
  },
  {
    question: "Search returns no people.",
    answer:
      "Broaden your wording slightly, remove ultra-narrow constraints, and confirm you are searching in a context that includes discoverable profiles. If credits are required, verify your balance on the credits screen before retrying.",
  },
  {
    question: "The builder feels stuck or will not save.",
    answer:
      "Refresh once, check connectivity, and look for inline validation messages near the field that failed. If voice was active, try saving after switching back to text to isolate a transcription issue.",
  },
  {
    question: "Voice input is inaccurate.",
    answer:
      "Speak in shorter phrases, reduce background noise, and re-record sections that matter legally or financially. Always edit transcripts so the final card matches your intent.",
  },
  {
    question: "Credits look wrong after a search.",
    answer:
      "Open the credits screen and read the latest activity text. If the UI shows an error reference, include that reference when you email support so we can trace the session.",
  },
  {
    question: "Who do I email when none of this works?",
    answer: `Write to ${SUPPORT_EMAIL} with your account email, approximate time, and the screen name where the problem appeared. Avoid sending passwords or government ID numbers.`,
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

export default function FaqTroubleshootingPage() {
  return (
    <>
      <JsonLd data={faqJsonLd()} />
      <DocsChrome
        title="Troubleshooting"
        description="Practical steps before you escalate. Still stuck after trying these? Email support with the details listed below."
      >
        <p className="text-muted-foreground">
          Start with{" "}
          <Link href="/faq/general" className="text-primary hover:underline">
            General FAQ
          </Link>{" "}
          if you are unsure whether behavior is a bug or expected.
        </p>
        <div className="space-y-10">
          {FAQ_ITEMS.map((item) => (
            <section key={item.question} className="space-y-2">
              <h2 className="font-display text-lg font-semibold text-foreground">{item.question}</h2>
              <p className="text-muted-foreground">{item.answer}</p>
            </section>
          ))}
        </div>
      </DocsChrome>
    </>
  );
}
