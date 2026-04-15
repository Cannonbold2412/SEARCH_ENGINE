"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export default function LandingHero() {
  const reduced = usePrefersReducedMotion();

  const fade = reduced
    ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.35 },
      };

  return (
    <section className="relative flex min-h-app-screen items-center justify-center overflow-x-clip overflow-y-hidden pt-[max(7rem,env(safe-area-inset-top)+5rem)] pb-16 sm:pt-32 sm:pb-20">
      {/* Grid + vignette (21st-style hero, CONXA tokens) */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.35]"
        style={{
          backgroundImage: `
            linear-gradient(to right, hsl(240 5% 26% / 0.5) 1px, transparent 1px),
            linear-gradient(to bottom, hsl(240 5% 26% / 0.5) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 30%, black 20%, transparent 75%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 50% 20%, hsl(244 95% 69% / 0.12), transparent 55%), radial-gradient(ellipse 60% 40% at 80% 80%, hsl(166 100% 42% / 0.08), transparent 50%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: "radial-gradient(ellipse at center, transparent 35%, hsl(234 60% 4%) 85%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full min-w-0 max-w-4xl px-4 text-center sm:px-6">
        <motion.span {...fade} className="mb-5 inline-block rounded-full border border-border/60 bg-card/40 px-4 py-2 font-body text-xs font-medium uppercase tracking-wider text-muted-foreground sm:mb-6 sm:text-[13px]">
          Find people by what they actually did
        </motion.span>

        <motion.h1
          {...fade}
          transition={{ duration: 0.35, delay: reduced ? 0 : 0.06 }}
          className="mb-5 text-balance font-display text-[2rem] font-bold leading-[1.08] tracking-tight sm:mb-6 sm:text-5xl sm:leading-[1.05] md:text-6xl lg:text-7xl"
        >
          Your work story,
          <br />
          <span className="gradient-text">easy for others to find.</span>
        </motion.h1>

        <motion.p
          {...fade}
          transition={{ duration: 0.35, delay: reduced ? 0 : 0.12 }}
          className="mx-auto mb-8 max-w-2xl text-pretty font-body text-base leading-relaxed text-muted-foreground sm:mb-10 sm:text-lg"
        >
          Describe your jobs and skills in normal words — any language, messy is fine. CONXA turns that into a clear profile. People
          search in plain English and see simple reasons why someone fits.
        </motion.p>

        <motion.div
          {...fade}
          transition={{ duration: 0.35, delay: reduced ? 0 : 0.18 }}
          className="flex w-full max-w-md flex-col items-stretch justify-center gap-3 sm:mx-auto sm:max-w-none sm:flex-row sm:items-center sm:gap-4"
        >
          <Link
            href="/signup"
            className="gradient-violet inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full px-8 py-3.5 text-center font-body text-base font-medium text-primary-foreground transition-colors duration-200 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary glow-violet"
          >
            Get started free
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-border/60 px-8 py-3.5 font-body text-base text-muted-foreground transition-colors duration-200 hover:border-foreground/25 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            See how it works <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </motion.div>
      </div>

      {!reduced && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.4 }}
          className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-10 -translate-x-1/2 sm:bottom-8"
        >
          <a
            href="#how-it-works"
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label="Scroll to how it works"
          >
            <ChevronDown className="h-5 w-5 animate-bounce" aria-hidden />
          </a>
        </motion.div>
      )}
    </section>
  );
}
