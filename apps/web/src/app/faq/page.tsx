import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";

export const metadata: Metadata = {
  title: "FAQ | CONXA",
  description: "Frequently asked questions about CONXA: general usage and troubleshooting.",
  alternates: { canonical: "/faq" },
};

export default function FaqIndexPage() {
  return (
    <DocsChrome
      title="FAQ"
      description="Two collections—general questions first, then practical fixes when something looks wrong."
    >
      <ul className="space-y-6 text-muted-foreground">
        <li>
          <Link href="/faq/general" className="font-display text-lg font-semibold text-foreground hover:text-primary hover:underline">
            General FAQ
          </Link>
          <p className="mt-1">Accounts, languages, credits at a high level, and what CONXA is for.</p>
        </li>
        <li>
          <Link href="/faq/troubleshooting" className="font-display text-lg font-semibold text-foreground hover:text-primary hover:underline">
            Troubleshooting
          </Link>
          <p className="mt-1">Sign-in issues, empty searches, builder or voice quirks, and where to email.</p>
        </li>
      </ul>
    </DocsChrome>
  );
}
