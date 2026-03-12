"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export default function CTASection() {
  return (
    <section className="py-24 px-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="container mx-auto max-w-3xl glass-card rounded-3xl p-12 sm:p-16 text-center relative overflow-hidden"
      >
        <div
          className="absolute inset-0 pointer-events-none animate-glow-pulse"
          style={{
            background: "radial-gradient(ellipse at center, hsl(244 95% 69% / 0.15), transparent 70%)",
          }}
        />

        <h2 className="font-display text-3xl sm:text-5xl font-bold mb-6 relative z-10">
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
