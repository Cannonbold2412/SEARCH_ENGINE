"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 glass-navbar transition-all duration-300 ${scrolled ? "py-3" : "py-4 sm:py-5"}`}
    >
      <div className="container mx-auto flex items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="font-display text-xl font-bold text-gradient-logo tracking-tight sm:text-2xl">
          CONXA
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {["How it works", "For Searches", "For People"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/\s/g, "-")}`}
              className="text-muted-foreground text-sm font-body hover:text-foreground transition-colors relative group"
            >
              {item}
              <span className="absolute -bottom-1 left-0 w-0 h-px bg-primary transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="px-3 py-2 text-sm font-body text-muted-foreground transition-colors hover:text-foreground sm:px-4"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="gradient-violet rounded-full px-4 py-2 text-sm font-body text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98] glow-violet-subtle sm:px-5"
          >
            Sign up
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}
