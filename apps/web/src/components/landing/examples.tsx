"use client";

import { motion } from "framer-motion";

const examples = [
  { title: "Apprentice electrician, 6 years Mumbai, certified master-trained", match: 92 },
  { title: "Quant analyst, Python + crypto, 3 years remote", match: 95 },
  { title: "Street food vendor, ₹20L monthly revenue, 15 staff managed", match: 88 },
];

export default function Examples() {
  return (
    <section className="py-24 px-6">
      <div className="container mx-auto max-w-4xl">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="font-display text-3xl sm:text-4xl font-bold text-center mb-12"
        >
          Profiles you&apos;d never find <span className="gradient-text">on a job board.</span>
        </motion.h2>

        <div className="grid sm:grid-cols-3 gap-6">
          {examples.map((ex, i) => (
            <motion.div
              key={ex.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass-card rounded-2xl p-6 hover:glow-violet-subtle transition-shadow duration-300"
            >
              <p className="font-body text-foreground text-sm leading-relaxed mb-4">&quot;{ex.title}&quot;</p>
              <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-secondary/10 text-secondary border border-secondary/20">
                {ex.match}% match
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
