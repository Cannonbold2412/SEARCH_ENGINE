"use client";

import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const examples = [
  { title: "Electrician apprentice, certified, 6 years in Mumbai", match: 92 },
  { title: "Data work with Python and crypto, mostly remote", match: 95 },
  { title: "Street food stall, team of 15, steady revenue", match: 88 },
];

export default function Examples() {
  const reduced = usePrefersReducedMotion();

  return (
    <section className="px-4 py-20 sm:px-6 sm:py-24">
      <div className="container mx-auto min-w-0 max-w-4xl">
        <motion.h2
          initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: reduced ? 0 : 0.4 }}
          className="mb-10 text-balance text-center font-display text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl"
        >
          Real paths, <span className="gradient-text">not only desk jobs</span>
        </motion.h2>

        <div className="grid gap-5 sm:grid-cols-3">
          {examples.map((ex, i) => (
            <motion.div
              key={ex.title}
              initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: reduced ? 0 : 0.35, delay: reduced ? 0 : i * 0.08 }}
              className="glass-card rounded-2xl p-6 transition-shadow duration-200 hover:glow-violet-subtle"
            >
              <p className="mb-4 font-body text-sm leading-relaxed text-foreground">&quot;{ex.title}&quot;</p>
              <span className="inline-block rounded-full border border-secondary/20 bg-secondary/10 px-2.5 py-1 font-mono text-xs text-secondary">
                {ex.match}% example match
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
