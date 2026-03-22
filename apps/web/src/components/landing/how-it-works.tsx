"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Keyboard, Cpu, Search } from "lucide-react";

const steps = [
  { icon: Keyboard, title: "Write anything", description: "Type your experience in any language, any format. Messy is fine.", color: "text-foreground" },
  { icon: Cpu, title: "CONXA structures it", description: "Our AI pipeline extracts skills, metrics, domains, and timelines.", color: "text-primary" },
  { icon: Search, title: "Get matched", description: "Recruiters find you through semantic search with human-readable match reasons.", color: "text-secondary" },
];

export default function HowItWorks() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} id="how-it-works" className="py-24 px-6">
      <div className="container mx-auto max-w-5xl">
        <motion.h2 initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} className="font-display text-4xl sm:text-5xl font-bold text-center mb-16">
          How it works
        </motion.h2>

        <div className="grid md:grid-cols-3 gap-8 relative">
          <div className="hidden md:block absolute top-16 left-[16.66%] right-[16.66%] h-px bg-border/60" />

          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.15, duration: 0.5 }}
              className="glass-card rounded-2xl p-8 text-center relative group hover:glow-violet-subtle transition-shadow duration-500"
            >
              <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-muted mb-6 ${step.color}`}>
                <step.icon className="w-5 h-5" />
              </div>
              <h3 className="font-display text-xl font-semibold mb-3">{step.title}</h3>
              <p className="text-muted-foreground font-body text-sm leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
