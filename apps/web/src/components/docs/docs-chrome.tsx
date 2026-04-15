import Link from "next/link";

const SECTION_NAV = [
  { href: "/docs", label: "Docs" },
  { href: "/guides", label: "Guides" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/faq", label: "FAQ" },
] as const;

export type DocsTocItem = { href: string; label: string };

export function DocsChrome({
  title,
  description,
  children,
  toc,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  toc?: DocsTocItem[];
}) {
  return (
    <main className="min-h-app-screen bg-background px-4 py-20 sm:px-6 sm:py-24">
      <div className="container mx-auto max-w-3xl text-foreground">
        <Link href="/" className="text-primary hover:underline mb-6 inline-block text-sm">
          ← Back to CONXA
        </Link>
        <nav aria-label="Documentation sections" className="mb-8 flex flex-wrap gap-x-4 gap-y-2 border-b border-border pb-4 text-sm">
          {SECTION_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-muted-foreground hover:text-primary hover:underline">
              {item.label}
            </Link>
          ))}
        </nav>
        <h1 className="mb-2 font-display text-3xl font-bold sm:text-4xl">{title}</h1>
        {description ? <p className="text-muted-foreground mb-8 text-sm sm:text-base">{description}</p> : null}
        {toc && toc.length > 0 ? (
          <nav aria-label="On this page" className="mb-10 rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <p className="mb-2 font-medium text-foreground">On this page</p>
            <ul className="space-y-1.5 text-muted-foreground">
              {toc.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="hover:text-primary hover:underline">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <article className="space-y-8 text-sm leading-relaxed sm:text-base">{children}</article>
        <footer className="mt-16 border-t border-border pt-8 text-sm text-muted-foreground">
          <Link href="/terms" className="hover:text-primary hover:underline">
            Terms
          </Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="hover:text-primary hover:underline">
            Privacy
          </Link>
        </footer>
      </div>
    </main>
  );
}
