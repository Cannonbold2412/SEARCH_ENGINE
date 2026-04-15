"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Briefcase,
  Lock,
  Mail,
  MapPin,
  Phone,
  ExternalLink,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoading, PageError, ErrorMessage } from "@/components/feedback";
import { SavedCardFamily } from "@/components/builder";
import { api, apiWithIdempotency } from "@/lib/api";
import { apiAssetUrl } from "@/lib/constants";
import type {
  PersonProfile,
  ContactDetails,
} from "@/lib/types";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/language-context";

type DetailRow = {
  label: string;
  value: string | number | boolean | null | undefined;
};

function detailValueToText(value: DetailRow["value"]): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function getInitials(name?: string | null): string {
  if (!name) return "A";
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "A";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function DetailGrid({ rows, columns = 2 }: { rows: DetailRow[]; columns?: 1 | 2 }) {
  const visibleRows = rows
    .map((row) => ({ ...row, text: detailValueToText(row.value) }))
    .filter((row) => row.text);

  if (visibleRows.length === 0) return null;

  return (
    <dl className={`grid gap-x-6 gap-y-3 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
      {visibleRows.map((row) => (
        <div key={row.label} className="space-y-0.5">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{row.label}</dt>
          <dd className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{row.text}</dd>
        </div>
      ))}
    </dl>
  );
}

function BioSection({ bio }: { bio: NonNullable<PersonProfile["bio"]> }) {
  const pastCompanies = bio.past_companies?.length
    ? bio.past_companies
        .map((company) =>
          [
            company.company_name,
            company.role ? `Role: ${company.role}` : null,
            company.years ? `Years: ${company.years}` : null,
          ]
            .filter(Boolean)
            .join(" | ")
        )
        .join("\n")
    : null;

  const rows: DetailRow[] = [
    { label: "Date of birth", value: bio.date_of_birth },
    { label: "Current city", value: bio.current_city },
    { label: "School", value: bio.school },
    { label: "College", value: bio.college },
    { label: "Current company", value: bio.current_company },
    { label: "Past companies", value: pastCompanies },
  ];

  const hasAnyValue = rows.some((row) => detailValueToText(row.value));
  if (!hasAnyValue) return null;

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base tracking-tight">About</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailGrid rows={rows} />
      </CardContent>
    </Card>
  );
}

export default function PersonProfilePage() {
  return (
    <Suspense fallback={<PageLoading message="Loading profile..." />}>
      <PersonProfilePageContent />
    </Suspense>
  );
}

function PersonProfilePageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const personId = params.id as string;
  const searchId = searchParams.get("search_id");
  const from = searchParams.get("from");
  const queryClient = useQueryClient();
  const { language } = useLanguage();

  const profileQuery = useQuery({
    queryKey: ["person", personId, searchId, language],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("language", language);
      if (searchId) params.set("search_id", searchId);
      return api<PersonProfile>(`/people/${personId}?${params.toString()}`);
    },
    enabled: !!personId,
  });

  const unlockMutation = useMutation({
    mutationFn: () => {
      const key = `unlock-${personId}-${searchId}`;
      return apiWithIdempotency<{ unlocked: boolean; contact: ContactDetails }>(
        `/people/${personId}/unlock-contact`,
        key,
        { method: "POST", body: searchId ? { search_id: searchId } : {} }
      );
    },
    onSuccess: (data) => {
      // Apply returned contact details immediately so the unlock feels instant.
      queryClient.setQueriesData<PersonProfile>(
        { queryKey: ["person", personId] },
        (current) => {
          if (!current) return current;
          return {
            ...current,
            contact: data.contact,
          };
        }
      );

      // Keep server state in sync without blocking the visible update.
      queryClient.invalidateQueries({ queryKey: ["person", personId], refetchType: "inactive" });
    },
  });

  const startChatMutation = useMutation({
    mutationFn: () =>
      api<{ conversation_id: string }>("/chat/conversations", {
        method: "POST",
        body: { target_person_id: personId },
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      router.push(`/inbox/${res.conversation_id}`);
    },
  });

  const isLoading = profileQuery.isLoading;
  const error = profileQuery.error;

  if (isLoading) {
    return <PageLoading message="Loading profile..." />;
  }

  const profile = profileQuery.data;
  if (error || !profile) {
    return (
      <PageError
        message={error instanceof Error ? error.message : "Failed to load profile"}
        backHref="/home"
        backLabel="Back to Home"
      />
    );
  }

  const contactUnlocked = !!profile.contact;
  const backHref = from === "unlocked" ? "/unlocked" : from === "explore" ? "/explore" : "/home";
  const backLabel = from === "unlocked" ? "Back to Unlocked" : from === "explore" ? "Back to Explore" : "Back";

  const rawPhotoUrl = profile.bio?.profile_photo_url ?? null;
  const profilePhotoSrc = rawPhotoUrl
    ? /^https?:\/\//i.test(rawPhotoUrl)
      ? rawPhotoUrl
      : apiAssetUrl(rawPhotoUrl)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-auto w-full max-w-4xl space-y-5 sm:space-y-6"
    >
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 rounded-md px-1 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group -mx-1 -my-1.5"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 shrink-0" />
        <span>{backLabel}</span>
      </Link>

      <Card className="relative overflow-hidden border-border/60 bg-card shadow-sm">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent"
          aria-hidden
        />
        <CardHeader className="relative pb-4 sm:pb-5">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:gap-6">
            <div className="min-w-0 space-y-3">
              <div className="flex items-start gap-3 sm:gap-4">
                {profilePhotoSrc ? (
                  <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-border/60 sm:h-16 sm:w-16">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={profilePhotoSrc}
                      alt={profile.display_name || "Profile photo"}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-14 w-14 flex-shrink-0 rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-muted flex items-center justify-center ring-2 ring-border/60 text-base font-semibold text-foreground sm:h-16 sm:w-16 sm:text-lg">
                    {getInitials(profile.display_name)}
                  </div>
                )}
                <div className="min-w-0">
                  <CardTitle className="text-xl tracking-tight sm:text-2xl">{profile.display_name || "Anonymous"}</CardTitle>
                  {profile.open_to_work && profile.work_preferred_locations?.length > 0 && (
                    <p className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/60 bg-muted/60 px-2.5 py-0.5 text-xs text-muted-foreground sm:text-sm">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
                      <span className="truncate">{profile.work_preferred_locations.join(", ")}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {profile.open_to_work && (
                  <span className="inline-flex items-center rounded-full border border-success/20 bg-success/10 px-3 py-1 text-xs font-medium text-success">
                    Open to work
                  </span>
                )}
                {profile.open_to_contact && (
                  <span className="inline-flex items-center rounded-full border border-info/20 bg-info/10 px-3 py-1 text-xs font-medium text-info">
                    Open to contact
                  </span>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-10 shrink-0 gap-1.5 rounded-full border-border/70 px-4 font-medium hover:bg-muted"
              onClick={() => startChatMutation.mutate()}
              disabled={startChatMutation.isPending}
              title="Start chat (1 credit)"
              aria-label="Start chat"
            >
              {startChatMutation.isPending ? (
                <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
                <MessageCircle className="h-4 w-4" />
              )}
              <span>{startChatMutation.isPending ? "Starting..." : "Chat"}</span>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {profile.bio && <BioSection bio={profile.bio} />}

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-2">
            <Briefcase className="h-4 w-4 shrink-0" />
            Experience
          </h2>
        </CardHeader>
        <CardContent>
          {profile.card_families && profile.card_families.length > 0 ? (
            <div className="space-y-5">
              {profile.card_families.map((family) => (
                <SavedCardFamily
                  key={family.parent.id}
                  readOnly
                  parent={family.parent}
                  childCards={family.children}
                />
              ))}
            </div>
          ) : profile.experience_cards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 py-10 text-center">
              <Briefcase className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No experience cards shared.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {profile.experience_cards.map((card) => (
                <SavedCardFamily
                  key={card.id}
                  readOnly
                  parent={card}
                  childCards={[]}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(profile.open_to_work || profile.open_to_contact || contactUnlocked) && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base tracking-tight">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {contactUnlocked ? (
              <div className="space-y-2">
                {(profile.contact?.email != null && profile.contact.email !== "") || profile.contact?.email_visible ? (
                  <div className="flex items-start gap-2 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-foreground">
                      {profile.contact?.email || "Email visible to you"}
                    </span>
                  </div>
                ) : null}
                {profile.contact?.phone && (
                  <div className="flex items-start gap-2 text-sm">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-foreground">{profile.contact.phone}</span>
                  </div>
                )}
                {profile.contact?.linkedin_url && (
                  <div className="flex items-start gap-2 text-sm">
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a href={profile.contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline break-all">
                      {profile.contact.linkedin_url}
                    </a>
                  </div>
                )}
                {profile.contact?.other && (
                  <p className="text-sm text-muted-foreground mt-1">{profile.contact.other}</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4 shrink-0" />
                  <span>Unlock email, phone, and links for 1 credit.</span>
                </p>
                <Button
                  size="default"
                  onClick={() => unlockMutation.mutate()}
                  disabled={unlockMutation.isPending}
                  className="gap-2 cursor-pointer"
                >
                  {unlockMutation.isPending ? (
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  ) : null}
                  {unlockMutation.isPending ? "Unlocking..." : "Unlock contact"}
                </Button>
                <p className="text-xs text-muted-foreground">One-time use per search. Credits apply.</p>
                {unlockMutation.isError && (
                  <div className="mt-3">
                    <ErrorMessage
                      message={unlockMutation.error instanceof Error ? unlockMutation.error.message : "Failed"}
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
