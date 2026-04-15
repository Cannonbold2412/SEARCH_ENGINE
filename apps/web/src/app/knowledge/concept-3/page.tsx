import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";

export const metadata: Metadata = {
  title: "Credits and contact flows | CONXA Knowledge",
  description:
    "How credits appear in CONXA, when the UI may charge them, and how contact-related steps are presented to users.",
  alternates: { canonical: "/knowledge/concept-3" },
};

export default function KnowledgeConcept3Page() {
  return (
    <DocsChrome
      title="Credits and contact flows"
      description="Credits are the in-app meter for certain actions; contact flows are labeled steps when sharing or requesting details."
    >
        <p className="font-medium text-foreground">
          One-line definition: your balance reflects usage the product explains on the credits screen; contact steps always show clearly when you
          are about to share or request information.
        </p>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Credits in plain terms</h2>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            <li>Credits are not a bank account—they mirror entitlements for specific product actions.</li>
            <li>Balances update after actions complete successfully unless the UI states otherwise.</li>
            <li>If a feature is unavailable because of credits, the product tells you before you waste time filling a long form.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Contact and unlock language</h2>
          <p className="text-muted-foreground">
            Whenever contact details might be revealed, CONXA uses explicit copy so both sides understand what is being shared. If you are unsure,
            pause and read the confirmation; you can also consult{" "}
            <Link href="/terms" className="text-primary hover:underline">
              Terms
            </Link>{" "}
            for legal framing.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Related</h2>
          <p className="text-muted-foreground">
            <Link href="/guides/basic-setup" className="text-primary hover:underline">
              Basic setup
            </Link>
            ,{" "}
            <Link href="/faq/troubleshooting" className="text-primary hover:underline">
              Troubleshooting
            </Link>
            .
          </p>
        </section>
      </DocsChrome>
  );
}
