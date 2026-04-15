"use client";

import Link from "next/link";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export default function CTASection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduced = usePrefersReducedMotion();

  return (
    <section ref={ref} className="px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-16 sm:px-6 sm:pb-24 sm:pt-24">
      <motion.div
        initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        animate={inView || reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        transition={{ duration: reduced ? 0 : 0.45 }}
        className="container relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-border/60 glass-card p-6 text-center sm:p-12 lg:p-14"
      >
        <div
          className="pointer-events-none absolute inset-0 animate-glow-pulse opacity-90"
          style={{
            background: "radial-gradient(ellipse at center, hsl(244 95% 69% / 0.12), transparent 70%)",
          }}
        />

        <h2 className="relative z-10 mb-3 font-display text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
          Ready to try it?
        </h2>
        <p className="relative z-10 mx-auto mb-8 max-w-md font-body text-muted-foreground">
          Make a free account and start your profile — or run a search and see how matches read.
        </p>

        <div className="relative z-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/signup"
            className="gradient-violet inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-full px-8 py-3 font-body text-base font-medium text-primary-foreground transition-colors duration-200 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary glow-violet"
          >
            Sign up free
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-full border border-border/80 bg-background/50 px-8 py-3 font-body text-base font-medium text-foreground transition-colors duration-200 hover:border-foreground/25 hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Log in
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
