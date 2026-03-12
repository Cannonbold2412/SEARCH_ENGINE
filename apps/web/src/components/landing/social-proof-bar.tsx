export default function SocialProofBar() {
  const items = [
    "Engineers",
    "Traders",
    "Carpenters",
    "Street Vendors",
    "Researchers",
    "Founders",
    "Freelancers",
    "Electricians",
    "Textile Workers",
    "Gig Workers",
    "Engineers",
    "Traders",
    "Carpenters",
    "Street Vendors",
    "Researchers",
    "Founders",
    "Freelancers",
    "Electricians",
    "Textile Workers",
    "Gig Workers",
  ];

  return (
    <section className="py-6 border-y border-border overflow-hidden">
      <div className="flex animate-ticker whitespace-nowrap">
        {items.map((item, i) => (
          <span key={i} className="text-muted-foreground text-sm font-body mx-6 flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-primary opacity-50" />
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
