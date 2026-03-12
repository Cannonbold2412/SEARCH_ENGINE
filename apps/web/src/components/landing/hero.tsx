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
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <ParticleField />
      </div>

      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 30%, hsl(234 60% 4%) 80%)",
        }}
      />

      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        <motion.span
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="inline-block font-mono text-xs tracking-[0.3em] uppercase text-secondary mb-6"
        >
          Human-Opportunity Matching
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="font-display font-bold text-5xl sm:text-7xl lg:text-8xl leading-[0.95] mb-6"
        >
          Every experience.
          <br />
          <span className="gradient-text">Searchable.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-muted-foreground text-lg sm:text-xl max-w-2xl mx-auto mb-10 font-body leading-relaxed"
        >
          CONXA turns messy, informal work history — in any language, any industry — into structured, searchable profiles. From street vendors to senior engineers.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            href="/signup"
            className="gradient-violet text-primary-foreground font-body font-medium px-8 py-3.5 rounded-full text-base hover:scale-[1.02] active:scale-[0.98] transition-transform glow-violet"
          >
            Get started free
          </Link>
          <a
            href="#how-it-works"
            className="flex items-center gap-2 text-muted-foreground font-body text-base border border-border rounded-full px-8 py-3.5 hover:text-foreground hover:border-foreground/20 transition-colors"
          >
            See how it works <ArrowRight className="w-4 h-4" />
          </a>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
      >
        <a href="#how-it-works" className="block">
          <ChevronDown className="w-5 h-5 text-muted-foreground animate-bounce" />
        </a>
      </motion.div>
    </section>
  );
}
