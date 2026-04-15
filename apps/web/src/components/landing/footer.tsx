import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer className="border-t border-border/60 px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="container mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <Link
            href="/"
            className="font-display text-lg font-bold text-gradient-logo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            CONXA
          </Link>
          <span className="font-body text-xs text-muted-foreground">Your work story, searchable.</span>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-6 font-body text-xs text-muted-foreground">
          <a href="/privacy" className="transition-colors hover:text-foreground focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Privacy
          </a>
          <a href="/terms" className="transition-colors hover:text-foreground focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Terms
          </a>
          <a href="/docs" className="transition-colors hover:text-foreground focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Documentation
          </a>
          <a href="mailto:hello@conxa.in" className="transition-colors hover:text-foreground focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Contact
          </a>
        </nav>

        <span className="font-body text-xs text-muted-foreground">Made in India</span>
      </div>
    </footer>
  );
}
