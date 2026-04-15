"use client";

import Link from "next/link";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { ArrowRight, UserCircle, Users } from "lucide-react";
import SearchDemo from "./search-demo";
import ProfileCardsStrip from "./profile-cards-strip";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export default function AudienceSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduced = usePrefersReducedMotion();

  const block = reduced
    ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 20 },
        animate: inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 },
        transition: { duration: 0.45 },
      };

  const introMotion = reduced
    ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 12 },
        animate: inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 },
        transition: { duration: 0.4 },
      };

  const peopleMotion = reduced
    ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 20 },
        animate: inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 },
        transition: { duration: 0.45, delay: 0.08 },
      };

  return (
    <section ref={ref} className="border-y border-border/40 bg-muted/20 px-4 py-20 sm:px-6 sm:py-24">
      <div className="container mx-auto min-w-0 max-w-6xl">
        <motion.div {...introMotion} className="mb-14 text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Who it&apos;s for
          </h2>
          <p className="mx-auto mt-3 max-w-lg font-body text-muted-foreground">
            Same product, two simple jobs: find someone, or be found.
          </p>
        </motion.div>

        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <motion.div
            id="for-searches"
            {...block}
            className="scroll-mt-32 sm:scroll-mt-28"
          >
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Users className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-xl font-semibold sm:text-2xl">Looking for the right person?</h3>
                <p className="font-body text-sm text-muted-foreground">Search by meaning, not only keywords.</p>
              </div>
            </div>
            <p className="mb-8 font-body text-muted-foreground">
              Ask in normal language. CONXA surfaces people whose real experience fits — and shows short &quot;why matched&quot; lines
              you can trust.
            </p>
            <SearchDemo />
            <ul className="mt-8 grid gap-3 font-body text-sm text-muted-foreground sm:grid-cols-2">
              {[
                "Search by skills and places you care about",
                "Filters for location, seniority, and job type",
                "Clear match reasons, not a black box",
                "Works for unusual paths, not only formal résumés",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div id="for-people" {...peopleMotion} className="scroll-mt-32 sm:scroll-mt-28">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
                <UserCircle className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-xl font-semibold sm:text-2xl">Sharing your story?</h3>
                <p className="font-body text-sm text-muted-foreground">Every job counts — not only office titles.</p>
              </div>
            </div>
            <p className="mb-8 font-body text-muted-foreground">
              Family shops, trades, side projects, and full-time roles all belong here. One setup, always searchable.
            </p>
            <ProfileCardsStrip />
            <ul className="mt-8 grid gap-3 font-body text-sm text-muted-foreground sm:grid-cols-2">
              {[
                "Works in many languages",
                "Informal and family work counts",
                "One profile, stays up to date",
                "No LinkedIn required",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-secondary" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Link
                href="/signup"
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg py-2 font-body text-sm font-medium text-primary transition-colors hover:text-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Create your profile <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
