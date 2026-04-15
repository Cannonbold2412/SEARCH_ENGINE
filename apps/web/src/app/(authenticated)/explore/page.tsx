"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Briefcase, ChevronRight, MapPin, Users } from "lucide-react";
import { api } from "@/lib/api";
import { PageError, PageLoading } from "@/components/feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonListResponse } from "@/lib/types";
import { useLanguage } from "@/contexts/language-context";

function getInitials(name?: string | null): string {
  if (!name) return "A";
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "A";
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

export default function ExplorePage() {
  const { language } = useLanguage();
  const { data, isLoading, error } = useQuery({
    queryKey: ["people", "explore", language],
    queryFn: () =>
      api<PersonListResponse>(`/people?language=${encodeURIComponent(language)}`),
  });

  const people = data?.people ?? [];

  if (isLoading) {
    return <PageLoading message="Loading profiles..." />;
  }

  if (error) {
    return (
      <PageError
        message={error instanceof Error ? error.message : "Failed to load profiles."}
        backHref="/home"
        backLabel="Back to Home"
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-6xl mx-auto space-y-6"
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Explore</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse profiles that have visible experience cards.
        </p>
      </div>

      {people.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <Users className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No profiles available yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              When people share their experience cards, they’ll show up here for you to explore.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person, index) => (
            <motion.li
              key={person.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02, duration: 0.22 }}
            >
              <Link
                href={`/people/${person.id}?from=explore`}
                className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Card className="relative h-full overflow-hidden border-border/60 bg-card transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted/40 hover:shadow-lg hover:shadow-black/5 hover:border-border md:hover:-translate-y-1">
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-primary/5 via-primary/0 to-transparent"
                    aria-hidden
                  />
                  <CardHeader className="relative pb-3">
                    <div className="flex items-start gap-3">
                      <div className="h-11 w-11 flex-shrink-0 rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-muted flex items-center justify-center ring-1 ring-border/60 text-xs font-semibold text-foreground sm:h-12 sm:w-12 sm:text-sm">
                        {getInitials(person.display_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="flex items-start justify-between gap-2 text-base">
                          <span className="line-clamp-1 leading-tight">{person.display_name || "Anonymous"}</span>
                          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
                        </CardTitle>
                        {person.current_location && (
                          <p className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/80" />
                            <span className="truncate">{person.current_location}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 pb-4">
                    {person.experience_summaries.length > 0 ? (
                      <ul className="space-y-2">
                        {person.experience_summaries.slice(0, 4).map((summary, i) => (
                          <li
                            key={`${person.id}-${i}`}
                            className="flex items-start gap-2 text-xs text-muted-foreground sm:text-[13px]"
                          >
                            <Briefcase className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary/70" />
                            <span className="line-clamp-2 leading-relaxed">{summary}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-lg border border-dashed border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        No experience summary available.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
