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
                className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
              >
                <Card className="h-full transition-all duration-200 hover:bg-muted/50 hover:shadow-md hover:border-border/60">
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-3">
                      <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center flex-shrink-0 ring-1 ring-border/50 text-sm font-medium text-muted-foreground">
                        {(person.display_name || "A").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base truncate flex items-center justify-between gap-2">
                          <span>{person.display_name || "Anonymous"}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        </CardTitle>
                        {person.current_location && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{person.current_location}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {person.experience_summaries.length > 0 ? (
                      <ul className="space-y-1.5">
                        {person.experience_summaries.slice(0, 4).map((summary, i) => (
                          <li
                            key={`${person.id}-${i}`}
                            className="text-xs text-muted-foreground flex items-start gap-2"
                          >
                            <Briefcase className="h-3 w-3 flex-shrink-0 mt-0.5 text-muted-foreground/80" />
                            <span className="line-clamp-2">{summary}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">No experience summary available.</p>
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
