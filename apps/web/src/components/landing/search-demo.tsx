"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Search } from "lucide-react";

const QUERY = "senior python engineer mumbai";
const RESULTS = [
  { title: "Arjun Mehta", subtitle: "Python Developer · Mumbai · 5 years", match: 96, reasons: ["Python expertise", "Mumbai-based", "Senior-level experience"] },
  { title: "Priya Sharma", subtitle: "Full-Stack Engineer · Navi Mumbai · 4 years", match: 89, reasons: ["Python + Django", "Mumbai metro area", "Quant background"] },
  { title: "Rahul Desai", subtitle: "Backend Engineer · Pune → Mumbai · 6 years", match: 84, reasons: ["Python backends", "Relocating to Mumbai", "Crypto derivatives"] },
];

export default function SearchDemo() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const [typedText, setTypedText] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
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
      }, 70 + Math.random() * 40);
      return () => clearInterval(interval);
    }
  }, [inView, started]);

  return (
    <div ref={ref} className="max-w-2xl mx-auto">
      <div className="glass-card rounded-2xl p-1 mb-6">
        <div className="flex items-center gap-3 px-5 py-4">
          <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <span className="font-body text-foreground text-base">
            {typedText}
            <span className="inline-block w-0.5 h-5 bg-primary ml-0.5 animate-typewriter-cursor align-middle" />
          </span>
        </div>
      </div>

      {showResults && (
        <div className="space-y-3">
          {RESULTS.map((result, i) => (
            <motion.div
              key={result.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15 }}
              className="glass-card rounded-xl p-5 hover:glow-violet-subtle transition-shadow duration-300"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-display font-semibold text-foreground">{result.title}</h4>
                  <p className="text-sm text-muted-foreground font-body">{result.subtitle}</p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-secondary/10 text-secondary border border-secondary/20">
                  {result.match}% match
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground font-body mr-1">Why matched:</span>
                {result.reasons.map((r) => (
                  <span key={r} className="text-xs font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
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
