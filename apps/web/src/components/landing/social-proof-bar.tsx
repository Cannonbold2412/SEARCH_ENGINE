const ROLES = [
  "Engineers",
  "Shop owners",
  "Carpenters",
  "Street vendors",
  "Researchers",
  "Founders",
  "Freelancers",
  "Electricians",
  "Textile workers",
  "Gig workers",
  "Home cooks",
  "Students",
];

export default function SocialProofBar() {
  const items = [...ROLES, ...ROLES];

  return (
    <section className="border-y border-border/60 py-5 overflow-x-clip sm:py-6" aria-label="Kinds of people on CONXA">
      <div className="flex animate-ticker whitespace-nowrap">
        {items.map((item, i) => (
          <span key={`${item}-${i}`} className="mx-6 flex items-center gap-2 font-body text-sm text-muted-foreground">
            <span className="h-1 w-1 flex-shrink-0 rounded-full bg-primary opacity-60" aria-hidden />
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
