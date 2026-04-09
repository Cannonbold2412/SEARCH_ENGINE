"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import SearchDemo from "./search-demo";

const bullets = [
  "Semantic search across all experience types",
  "Filters: location, domain, employment type, seniority",
  "Human-readable match explanations — no black box",
  "Works for non-traditional profiles too",
];

export default function ForRecruiters() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} id="for-searches" className="py-24 px-6">
      <div className="container mx-auto max-w-5xl">
        <motion.h2 initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} className="font-display text-4xl sm:text-5xl font-bold text-center mb-4">
          Search people, <span className="gradient-text">not keywords.</span>
        </motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 0.15 }} className="text-muted-foreground text-center font-body mb-12 max-w-xl mx-auto">
          Find talent by what they&apos;ve actually done — not how well they filled out a form.
        </motion.p>

        <SearchDemo />

        <motion.ul initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.3 }} className="grid sm:grid-cols-2 gap-4 mt-12 max-w-2xl mx-auto">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-3 text-sm font-body text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
              {b}
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
