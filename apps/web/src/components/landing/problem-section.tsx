"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

export default function ProblemSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="py-24 px-6">
      <div className="container mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="grid md:grid-cols-2 gap-8"
        >
          <div className="glass-card rounded-2xl p-8 relative overflow-hidden">
            <span className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-4 block">
              What people actually write
            </span>
            <div className="font-mono text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {`"worked @ dads shop surat 3 yrs handled buyers n logistics whole export side

also some python stuff freelance 2022-23 did like 3 projects idk"`}
            </div>
            <div className="absolute inset-0 border border-border rounded-2xl pointer-events-none" />
          </div>

          <div className="glass-card rounded-2xl p-8 relative overflow-hidden glow-violet-subtle">
            <span className="text-xs font-mono text-secondary tracking-wider uppercase mb-4 block">
              What CONXA creates
            </span>
            <div className="space-y-4">
              <div>
                <p className="font-display text-lg font-semibold text-foreground">Export Operations Manager</p>
                <p className="text-sm text-muted-foreground font-body">Family Textile Business · Surat · 2019–2022</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {["Buyer Management", "Export Logistics", "Supply Chain"].map((s) => (
                  <span key={s} className="text-xs font-mono px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {s}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {["Python", "Freelance Dev"].map((s) => (
                  <span key={s} className="text-xs font-mono px-2.5 py-1 rounded-full bg-secondary/10 text-secondary border border-secondary/20">
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div className="absolute inset-0 border border-primary/20 rounded-2xl pointer-events-none" />
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="text-center text-muted-foreground font-body mt-10 text-lg"
        >
          No forms. No dropdowns. <span className="text-foreground">Just tell us what you did.</span>
        </motion.p>
      </div>
    </section>
  );
}
