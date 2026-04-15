import type { Metadata } from "next";
import Link from "next/link";
import { DocsChrome } from "@/components/docs/docs-chrome";

export const metadata: Metadata = {
  title: "Basic setup | CONXA Guides",
  description:
    "Set your preferred viewer language, understand credits in the CONXA UI, and keep your Experience Card accurate over time.",
  alternates: { canonical: "/guides/basic-setup" },
};

export default function BasicSetupPage() {
  return (
    <DocsChrome
      title="Basic setup"
      description="Ongoing configuration that keeps the product feeling predictable—without touching engineering settings you never see in-app."
    >
        <section className="space-y-3" id="language">
          <h2 className="font-display text-xl font-semibold">Viewer language</h2>
          <p className="text-muted-foreground">
            Pick the language you want for parts of the interface and supported content. Changing this preference does not rewrite another person’s
            source material; it changes how certain strings are shown to you when translations exist.
          </p>
          <p className="text-muted-foreground">
            If something still appears in a language you do not expect, note the screen name and check the{" "}
            <Link href="/faq/troubleshooting" className="text-primary hover:underline">
              Troubleshooting FAQ
            </Link>
            .
          </p>
        </section>

        <section className="space-y-3" id="credits">
          <h2 className="font-display text-xl font-semibold">Credits you can see</h2>
          <p className="text-muted-foreground">
            Open the credits area from the authenticated navigation when it is available. Your balance and any explanatory text there are the
            authoritative description of what consumes credits for your account.
          </p>
          <p className="text-muted-foreground">
            Before running a search or an action that might charge credits, read the inline confirmation the product shows. If no confirmation
            appears, assume the action follows the same rules as similar actions you have already performed.
          </p>
        </section>

        <section className="space-y-3" id="accuracy">
          <h2 className="font-display text-xl font-semibold">Keep your card accurate</h2>
          <p className="text-muted-foreground">
            Set a simple calendar reminder to revisit the builder quarterly. Update titles, scope, and outcomes when they change so searchers always
            see the version you would defend in an interview.
          </p>
          <p className="text-muted-foreground">
            When you are ready for deeper habits, continue with{" "}
            <Link href="/guides/advanced-usage" className="text-primary hover:underline">
              Advanced usage
            </Link>
            .
          </p>
        </section>
      </DocsChrome>
  );
}
