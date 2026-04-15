import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";

export const metadata: Metadata = {
  title: "Documentation | CONXA",
  description: "Product documentation for CONXA—overview, how it works, concepts, and how areas of the app fit together.",
  alternates: { canonical: "/docs" },
};

const CHILDREN = [
  { href: "/docs/overview", title: "Overview", blurb: "What CONXA is for and who it helps." },
  { href: "/docs/how-it-works", title: "How it works", blurb: "From account to search in plain language." },
  { href: "/docs/architecture", title: "How the product fits together", blurb: "Screens and flows, not engineering diagrams." },
  { href: "/docs/concepts", title: "Key concepts", blurb: "Definitions you will see while using the app." },
] as const;

export default function DocsIndexPage() {
  return (
    <DocsChrome
      title="Documentation"
      description="User-facing guides to CONXA. These pages describe what you can do in the product—not internal engineering."
    >
      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Start here</h2>
        <p className="text-muted-foreground">
          If you are new, read <Link href="/docs/overview">Overview</Link> then <Link href="/guides/getting-started">Getting started</Link>.
          Use <Link href="/faq/general">General FAQ</Link> for quick answers.
        </p>
      </section>
      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">In this section</h2>
        <ul className="space-y-4 text-muted-foreground">
          {CHILDREN.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="font-medium text-foreground hover:text-primary hover:underline">
                {item.title}
              </Link>
              <p className="mt-1">{item.blurb}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Related</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            <Link href="/guides" className="text-primary hover:underline">
              Guides
            </Link>{" "}
            — step-by-step tasks.
          </li>
          <li>
            <Link href="/knowledge" className="text-primary hover:underline">
              Knowledge base
            </Link>{" "}
            — short definitions.
          </li>
          <li>
            <Link href="/faq" className="text-primary hover:underline">
              FAQ
            </Link>{" "}
            — questions and troubleshooting.
          </li>
        </ul>
      </section>
    </DocsChrome>
  );
}
