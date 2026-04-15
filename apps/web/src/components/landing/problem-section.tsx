"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export default function ProblemSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduced = usePrefersReducedMotion();

  const enter = reduced
    ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 20 } as const,
        animate: inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 },
        transition: { duration: 0.45 },
      };

  const enterDelayed = reduced
    ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 20 } as const,
        animate: inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 },
        transition: { duration: 0.45, delay: 0.08 },
      };

  const fadeLine = reduced
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0 } as const,
        animate: inView ? { opacity: 1 } : { opacity: 0 },
        transition: { delay: 0.2, duration: 0.45 },
      };

  return (
    <section ref={ref} className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="container mx-auto min-w-0 max-w-5xl">
        <h2 className="mb-10 text-center font-display text-2xl font-bold tracking-tight sm:text-3xl">
          From messy words to a clear profile
        </h2>
        <div className="grid min-w-0 gap-6 md:grid-cols-2 md:gap-8">
          <motion.div
            {...enter}
            className="glass-card relative min-w-0 overflow-hidden rounded-2xl p-5 sm:p-8"
          >
            <span className="mb-4 block font-body text-xs font-medium uppercase tracking-wider text-muted-foreground">
              What people often write
            </span>
            <div className="whitespace-pre-line break-words font-mono text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
              {`"warehouse night shift pune ~2 yrs — pick/pack + showed new people the floor

zomato weekends when money was tight lol

learned python from yt, made 2 tiny inventory scripts for a friends shop (nothing official)"`}
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-2xl border border-border/60" />
          </motion.div>

          <motion.div
            {...enterDelayed}
            className="glass-card relative min-w-0 overflow-hidden rounded-2xl p-5 glow-violet-subtle sm:p-8"
          >
            <span className="mb-4 block font-body text-xs font-medium uppercase tracking-wider text-secondary">
              What CONXA helps show
            </span>
            <div className="space-y-5">
              <div>
                <p className="font-display text-lg font-semibold text-foreground">Warehouse &amp; floor training</p>
                <p className="font-body text-sm text-muted-foreground">Pune · night shifts · 2021–2023</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["Pick/pack", "Peer onboarding", "Night operations"].map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 font-mono text-xs text-primary"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-display text-base font-semibold text-foreground">Weekend gig delivery</p>
                <p className="font-body text-sm text-muted-foreground">App-based · flexible hours</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["On-demand platforms", "Local routes"].map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 font-mono text-xs text-primary"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-display text-base font-semibold text-foreground">Self-taught Python</p>
                <p className="font-body text-sm text-muted-foreground">Small inventory helpers for a local shop</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["Python", "Inventory tools", "Self-directed learning"].map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-secondary/20 bg-secondary/10 px-2.5 py-1 font-mono text-xs text-secondary"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-2xl border border-primary/20" />
          </motion.div>
        </div>

        <motion.p
          {...fadeLine}
          className="mt-8 text-center font-body text-base text-muted-foreground sm:mt-10 sm:text-lg"
        >
          No long forms. <span className="text-foreground">Just tell us what you did.</span>
        </motion.p>
      </div>
    </section>
  );
}
