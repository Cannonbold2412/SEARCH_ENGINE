"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { apiAssetUrl } from "@/lib/constants";
import type { PersonSearchResult } from "@/lib/types";

type PersonResultCardProps = {
  person: PersonSearchResult;
  searchId: string;
  index?: number;
};

export function PersonResultCard({ person, searchId, index = 0 }: PersonResultCardProps) {
  const similarityPercent =
    typeof person.similarity_percent === "number"
      ? Math.max(0, Math.min(100, Math.round(person.similarity_percent)))
      : null;
  const profilePhotoSrc = person.profile_photo_url
    ? /^https?:\/\//i.test(person.profile_photo_url)
      ? person.profile_photo_url
      : apiAssetUrl(person.profile_photo_url)
    : null;

  const whyFromApi = (person.why_matched ?? [])
    .map((item) => item?.trim() || "")
    .filter(Boolean)
    .slice(0, 3);
  const whyShown =
    whyFromApi.length > 0
      ? whyFromApi
      : ["Matched your search intent and profile signals."];

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      className="h-full"
    >
      <Link
        href={`/people/${person.id}?search_id=${searchId}`}
        className="block h-full min-h-[44px] rounded-xl border border-border/60 bg-card p-4 sm:p-5 transition-all duration-200 hover:bg-accent/50 hover:border-border/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-accent/70"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            {profilePhotoSrc ? (
              <div className="h-11 w-11 rounded-full bg-muted overflow-hidden flex-shrink-0 ring-1 ring-border/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={profilePhotoSrc}
                  alt={person.name || "Profile photo"}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center flex-shrink-0 ring-1 ring-border/50 text-sm font-medium text-muted-foreground">
                {(person.name || "A").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground truncate">
                {person.name || "Anonymous"}
              </p>
              {person.headline && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{person.headline}</p>
              )}
            </div>
          </div>
          <div className="mt-3 border-t border-border/60 pt-3 space-y-1.5">
            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground/90 flex justify-between items-center gap-2">
                <span>Why matched</span>
                {similarityPercent != null && (
                  <span className="flex-shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-foreground font-semibold text-[11px]">
                    {similarityPercent}%
                  </span>
                )}
              </p>
              <ul className="mt-1.5 space-y-1">
                {whyShown.map((reason, idx) => (
                  <li key={`${person.id}-why-${idx}`} className="leading-snug pl-0 flex items-start gap-1.5">
                    <span className="text-primary/60 mt-1.5 shrink-0 size-1 rounded-full bg-current" aria-hidden />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Link>
    </motion.li>
  );
}
