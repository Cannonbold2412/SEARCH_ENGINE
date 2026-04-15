"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "motion/react";
import { Search } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const QUERY = "experienced python engineer in mumbai";
const RESULTS = [
  {
    title: "Arjun Mehta",
    subtitle: "Python developer · Mumbai · 5 years",
    match: 96,
    reasons: ["Python", "Mumbai", "Senior level"],
  },
  {
    title: "Priya Sharma",
    subtitle: "Full-stack engineer · Navi Mumbai · 4 years",
    match: 89,
    reasons: ["Python stack", "Nearby", "Numbers background"],
  },
  {
    title: "Rahul Desai",
    subtitle: "Backend engineer · Pune, open to Mumbai · 6 years",
    match: 84,
    reasons: ["Python backends", "Can relocate", "Finance tech"],
  },
];

export default function SearchDemo() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduced = usePrefersReducedMotion();
  const [typedText, setTypedText] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (reduced && inView) {
      setTypedText(QUERY);
      setShowResults(true);
      return;
    }
    if (inView && !started) {
      setStarted(true);
      let i = 0;
      const interval = setInterval(() => {
        if (i <= QUERY.length) {
          setTypedText(QUERY.slice(0, i));
          i++;
        } else {
          clearInterval(interval);
          setTimeout(() => setShowResults(true), 400);
        }
      }, 55);
      return () => clearInterval(interval);
    }
  }, [inView, started, reduced]);

  return (
    <div ref={ref} className="mx-auto w-full min-w-0 max-w-2xl">
      <div className="glass-card mb-6 rounded-2xl p-1">
        <div className="flex min-w-0 items-start gap-3 px-4 py-4 sm:items-center sm:px-5">
          <Search className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground sm:mt-0" aria-hidden />
          <span className="min-w-0 break-words font-body text-sm text-foreground sm:text-base">
            {typedText}
            {!reduced && (
              <span className="ml-0.5 inline-block h-5 w-0.5 animate-typewriter-cursor bg-primary align-middle" aria-hidden />
            )}
          </span>
        </div>
      </div>

      {showResults && (
        <div className="space-y-3">
          {RESULTS.map((result, i) => (
            <motion.div
              key={result.title}
              initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.35, delay: reduced ? 0 : i * 0.1 }}
              className="glass-card rounded-xl p-4 transition-shadow duration-200 hover:glow-violet-subtle sm:p-5"
            >
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <h4 className="font-display font-semibold text-foreground">{result.title}</h4>
                  <p className="break-words font-body text-sm text-muted-foreground">{result.subtitle}</p>
                </div>
                <span className="flex-shrink-0 self-start rounded-full border border-secondary/20 bg-secondary/10 px-2.5 py-1 font-mono text-xs text-secondary">
                  {result.match}% match
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 font-body text-xs text-muted-foreground">Why matched:</span>
                {result.reasons.map((r) => (
                  <span
                    key={r}
                    className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
