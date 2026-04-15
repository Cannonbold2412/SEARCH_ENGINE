import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer className="border-t border-border/60 py-12 px-6">
      <div className="container mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex flex-col items-center sm:items-start gap-1">
          <Link href="/" className="font-display text-lg font-bold text-gradient-logo">
            CONXA
          </Link>
          <span className="text-xs text-muted-foreground font-body">Every experience. Searchable.</span>
        </div>

        <div className="flex items-center gap-6 text-xs text-muted-foreground font-body">
          <a href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </a>
          <a href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </a>
          <a href="/docs" className="hover:text-foreground transition-colors">
            Documentation
          </a>
          <a href="mailto:hello@conxa.in" className="hover:text-foreground transition-colors">
            Contact
          </a>
        </div>

        <span className="text-xs text-muted-foreground font-body">Built in India 🇮🇳</span>
      </div>
    </footer>
  );
}
