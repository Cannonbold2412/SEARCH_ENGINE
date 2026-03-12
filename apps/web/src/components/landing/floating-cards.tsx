"use client";

import { motion } from "framer-motion";

const cards = [
  { title: "Street Vendor → ₹15L in 2 months", subtitle: "20 Mumbai studio partnerships", badges: ["Revenue Growth", "B2B Sales", "Market Expansion"], match: 94 },
  { title: "Apprentice Carpenter", subtitle: "Master-trained · 8 years Rajasthan furniture", badges: ["Traditional Craft", "Woodworking", "Apprenticeship"], match: 91 },
  { title: "Family Textile Business", subtitle: "Buyer management · Surat export logistics", badges: ["Export Ops", "Supply Chain", "Family Business"], match: 88 },
];

export default function FloatingCards() {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.15 }}
          whileHover={{ y: -6, rotateY: 5, rotateX: -3 }}
          style={{ perspective: 800 }}
          className="glass-card rounded-2xl p-6 w-full sm:w-72 group hover:glow-violet-subtle transition-shadow duration-500 cursor-default"
        >
          <div className="flex justify-between items-start mb-3">
            <h4 className="font-display font-semibold text-foreground text-sm leading-tight">{card.title}</h4>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-secondary/10 text-secondary border border-secondary/20 flex-shrink-0 ml-2">
              {card.match}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-body mb-4">{card.subtitle}</p>
          <div className="flex flex-wrap gap-1.5">
            {card.badges.map((b) => (
              <span key={b} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {b}
              </span>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
