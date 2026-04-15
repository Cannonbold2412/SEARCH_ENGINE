"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const navItems: { label: string; href: string }[] = [
  { label: "How it works", href: "#how-it-works" },
  { label: "For searchers", href: "#for-searches" },
  { label: "For people", href: "#for-people" },
];

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    const onResize = () => {
      if (window.matchMedia("(min-width: 768px)").matches) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <motion.header
        initial={reduced ? { opacity: 1, y: 0 } : { y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="pointer-events-none fixed left-0 right-0 top-0 z-[60] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6"
      >
        <nav
          className={`pointer-events-auto flex w-full max-w-6xl items-center justify-between gap-2 rounded-2xl border border-border/60 px-3 py-3 transition-shadow duration-200 sm:gap-3 sm:px-6 ${
            scrolled ? "bg-background/90 shadow-lg backdrop-blur-md" : "glass-navbar rounded-2xl border-border/60"
          }`}
          aria-label="Main"
        >
          <Link
            href="/"
            className="min-h-11 min-w-[4.5rem] shrink-0 font-display cursor-pointer text-lg font-bold tracking-tight text-gradient-logo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-0 sm:text-2xl"
          >
            CONXA
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="cursor-pointer font-body text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="flex min-h-11 items-center gap-1 sm:gap-3">
            <Link
              href="/login"
              className="hidden min-h-11 cursor-pointer items-center justify-center rounded-lg px-3 font-body text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:inline-flex md:px-4"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="gradient-violet inline-flex min-h-11 min-w-[5.5rem] cursor-pointer items-center justify-center rounded-full px-4 font-body text-sm text-primary-foreground transition-colors duration-200 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary glow-violet-subtle sm:min-w-0 sm:px-5"
            >
              Sign up
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
              aria-expanded={mobileOpen}
              aria-controls="landing-mobile-nav"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X className="h-6 w-6" aria-hidden /> : <Menu className="h-6 w-6" aria-hidden />}
            </button>
          </div>
        </nav>
      </motion.header>

      {/* Mobile full-screen nav */}
      <div
        id="landing-mobile-nav"
        className={`fixed inset-0 z-[55] md:hidden ${
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-200 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeMobile}
          aria-label="Close menu"
        />
        <motion.div
          initial={false}
          animate={mobileOpen ? { opacity: 1, y: 0 } : { opacity: 0, y: -12 }}
          transition={{ duration: reduced ? 0 : 0.2 }}
          className={`absolute left-3 right-3 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] z-[56] max-h-[min(80vh,560px)] overflow-y-auto rounded-2xl border border-border/60 bg-card shadow-xl ${
            mobileOpen ? "" : "pointer-events-none invisible"
          }`}
        >
          <nav className="flex flex-col gap-1 p-2" aria-label="Mobile">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                className="min-h-12 cursor-pointer rounded-xl px-4 py-3 font-body text-base text-foreground transition-colors hover:bg-muted/60 active:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {item.label}
              </a>
            ))}
            <hr className="my-2 border-border/60" />
            <Link
              href="/login"
              onClick={closeMobile}
              className="min-h-12 cursor-pointer rounded-xl px-4 py-3 font-body text-base text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground active:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              onClick={closeMobile}
              className="gradient-violet mx-2 mb-2 mt-1 flex min-h-12 cursor-pointer items-center justify-center rounded-full font-body text-base font-medium text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Sign up free
            </Link>
          </nav>
        </motion.div>
      </div>
    </>
  );
}
