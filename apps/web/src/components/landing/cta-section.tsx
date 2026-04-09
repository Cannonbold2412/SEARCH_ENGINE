"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export default function CTASection() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="container relative mx-auto max-w-3xl overflow-hidden rounded-3xl glass-card p-6 text-center sm:p-12 lg:p-16"
      >
        <div
          className="absolute inset-0 pointer-events-none animate-glow-pulse"
          style={{
            background: "radial-gradient(ellipse at center, hsl(244 95% 69% / 0.15), transparent 70%)",
          }}
        />

        <h2 className="relative z-10 mb-6 font-display text-3xl font-bold sm:text-5xl">
          Start building your
          <br />
          <span className="gradient-text">searchable profile.</span>
        </h2>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
          <Link
            href="/signup"
            className="gradient-violet text-primary-foreground font-body font-medium px-8 py-3.5 rounded-full text-base hover:scale-[1.02] active:scale-[0.98] transition-transform glow-violet inline-block"
          >
            Sign up free
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
