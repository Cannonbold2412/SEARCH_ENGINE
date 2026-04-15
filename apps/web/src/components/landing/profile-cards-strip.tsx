"use client";

import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const cards = [
  {
    title: "Street stall → strong sales",
    subtitle: "Partnerships across Mumbai",
    badges: ["Sales", "Local trade", "Growth"],
    match: 94,
  },
  {
    title: "Carpentry apprentice",
    subtitle: "Years of hands-on furniture work",
    badges: ["Craft", "Wood", "Training"],
    match: 91,
  },
  {
    title: "Family export business",
    subtitle: "Buyers and shipping out of Surat",
    badges: ["Exports", "Logistics", "Family shop"],
    match: 88,
  },
];

export default function ProfileCardsStrip() {
  const reduced = usePrefersReducedMotion();

  return (
    <div className="flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:gap-5">
      {cards.map((card, i) => (
        <motion.div
          key={card.title}
          initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: reduced ? 0 : 0.35, delay: reduced ? 0 : i * 0.08 }}
          whileHover={reduced ? undefined : { y: -4 }}
          className="glass-card group w-full cursor-default rounded-2xl p-5 transition-shadow duration-200 hover:glow-violet-subtle sm:max-w-[220px] sm:flex-1"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <h4 className="font-display text-sm font-semibold leading-snug text-foreground">{card.title}</h4>
            <span className="flex-shrink-0 rounded-full border border-secondary/20 bg-secondary/10 px-2 py-0.5 font-mono text-[10px] text-secondary">
              {card.match}%
            </span>
          </div>
          <p className="mb-3 font-body text-xs text-muted-foreground">{card.subtitle}</p>
          <div className="flex flex-wrap gap-1.5">
            {card.badges.map((b) => (
              <span
                key={b}
                className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary"
              >
                {b}
              </span>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
