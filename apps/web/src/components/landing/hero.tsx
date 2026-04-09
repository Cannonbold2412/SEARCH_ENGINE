"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";

const ParticleField = dynamic(() => import("./particle-field"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-background" />,
});

export default function LandingHero() {
  return (
    <section className="relative flex min-h-app-screen items-center justify-center overflow-hidden pt-24 pb-12 sm:pt-28 sm:pb-16">
      <div className="absolute inset-0 z-0">
        <ParticleField />
      </div>

      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 30%, hsl(234 60% 4%) 80%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6">
        <motion.span
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="mb-5 inline-block font-mono text-[11px] uppercase tracking-[0.24em] text-secondary sm:mb-6 sm:text-xs sm:tracking-[0.3em]"
        >
          Human-Opportunity Matching
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-5 font-display text-4xl font-bold leading-[0.95] sm:mb-6 sm:text-6xl lg:text-8xl"
        >
          Every experience.
          <br />
          <span className="gradient-text">Searchable.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mx-auto mb-8 max-w-2xl font-body text-base leading-relaxed text-muted-foreground sm:mb-10 sm:text-xl"
        >
          CONXA turns messy, informal work history — in any language, any industry — into structured, searchable profiles. From street vendors to senior engineers.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4"
        >
          <Link
            href="/signup"
            className="gradient-violet rounded-full px-8 py-3.5 text-base font-body font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98] glow-violet"
          >
            Get started free
          </Link>
          <a
            href="#how-it-works"
            className="flex items-center justify-center gap-2 rounded-full border border-border/60 px-8 py-3.5 text-base font-body text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            See how it works <ArrowRight className="w-4 h-4" />
          </a>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 sm:bottom-8"
      >
        <a href="#how-it-works" className="block">
          <ChevronDown className="w-5 h-5 text-muted-foreground animate-bounce" />
        </a>
      </motion.div>
    </section>
  );
}
