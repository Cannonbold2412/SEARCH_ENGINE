"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { Keyboard, Sparkles, Search } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const steps = [
  {
    icon: Keyboard,
    title: "You write in your own words",
    description: "Type your jobs and skills however you talk. Any language. Short notes are OK.",
  },
  {
    icon: Sparkles,
    title: "CONXA sorts it into a profile",
    description: "We pull out skills, places, and time ranges so your story is easy to read and search.",
  },
  {
    icon: Search,
    title: "Searchers find you — and see why",
    description: "Someone types what they need. They get matches plus short, plain reasons for each fit.",
  },
];

export default function HowItWorks() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduced = usePrefersReducedMotion();

  const headingMotion = reduced
    ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 16 },
        animate: inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 },
        transition: { duration: 0.4 },
      };

  const subMotion = reduced
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0 },
        animate: inView ? { opacity: 1 } : { opacity: 0 },
        transition: { delay: 0.06, duration: 0.4 },
      };

  return (
    <section ref={ref} id="how-it-works" className="scroll-mt-32 px-4 py-20 sm:scroll-mt-28 sm:px-6 sm:py-24">
      <div className="container mx-auto min-w-0 max-w-5xl">
        <motion.h2 {...headingMotion} className="mb-4 text-center font-display text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
          How it works
        </motion.h2>
        <motion.p {...subMotion} className="mx-auto mb-14 max-w-xl text-center font-body text-muted-foreground">
          Three simple steps — no buzzwords required.
        </motion.p>

        <div className="relative grid gap-6 md:grid-cols-3 md:gap-8">
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-12 hidden h-px bg-border/50 md:block" />

          {steps.map((step, i) => {
            const stepMotion = reduced
              ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
              : {
                  initial: { opacity: 0, y: 24 },
                  animate: inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
                  transition: { duration: 0.4, delay: i * 0.1 },
                };
            return (
              <motion.div
                key={step.title}
                {...stepMotion}
                className="glass-card group relative rounded-2xl p-6 text-center transition-shadow duration-200 hover:glow-violet-subtle sm:p-8"
              >
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-foreground">
                  <step.icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="mb-3 font-display text-lg font-semibold sm:text-xl">{step.title}</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
