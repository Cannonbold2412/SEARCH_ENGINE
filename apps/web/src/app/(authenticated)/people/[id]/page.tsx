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
} from "@/types";
import { useRouter } from "next/navigation";

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

function DetailGrid({ rows, columns = 2 }: { rows: DetailRow[]; columns?: 1 | 2 }) {
  const visibleRows = rows
    .map((row) => ({ ...row, text: detailValueToText(row.value) }))
    .filter((row) => row.text);

  if (visibleRows.length === 0) return null;

  return (
    <dl className={`grid gap-3 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
      {visibleRows.map((row) => (
        <div key={row.label} className="space-y-1">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{row.label}</dt>
          <dd className="text-sm text-foreground whitespace-pre-wrap break-words">{row.text}</dd>
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">About</CardTitle>
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

  const profileQuery = useQuery({
    queryKey: ["person", personId, searchId],
    queryFn: () => {
      if (searchId) {
        return api<PersonProfile>(
          `/people/${personId}?search_id=${encodeURIComponent(searchId)}`
        );
      }
      return api<PersonProfile>(`/people/${personId}`);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["person", personId, searchId] });
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
      className="max-w-2xl mx-auto space-y-6"
    >
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 py-1.5 -my-1.5 px-1 -mx-1 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 shrink-0" />
        <span>{backLabel}</span>
      </Link>

      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col space-y-2 min-w-0">
              <div className="flex items-center gap-4">
                {profilePhotoSrc ? (
                  <div className="h-14 w-14 rounded-full bg-muted overflow-hidden flex-shrink-0 ring-2 ring-border/50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={profilePhotoSrc}
                      alt={profile.display_name || "Profile photo"}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center flex-shrink-0 ring-2 ring-border/50 text-lg font-medium text-muted-foreground">
                    {(profile.display_name || "A").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <CardTitle className="text-xl tracking-tight">{profile.display_name || "Anonymous"}</CardTitle>
                  {profile.open_to_work && profile.work_preferred_locations?.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span>{profile.work_preferred_locations.join(", ")}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {profile.open_to_work && (
                  <span className="inline-flex items-center rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success ring-1 ring-inset ring-success/20">
                    Open to work
                  </span>
                )}
                {profile.open_to_contact && (
                  <span className="inline-flex items-center rounded-full bg-info/10 px-3 py-1 text-xs font-medium text-info ring-1 ring-inset ring-info/20">
                    Open to contact
                  </span>
                )}
              </div>
            </div>
            <Button
              size="icon"
              variant="outline"
              className="shrink-0 h-10 w-10 rounded-full border-2"
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
            </Button>
          </div>
        </CardHeader>
      </Card>

      {profile.bio && <BioSection bio={profile.bio} />}

      <section className="pt-1">
        <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Briefcase className="h-4 w-4 shrink-0" />
          Experience
        </h2>
        {profile.card_families && profile.card_families.length > 0 ? (
          <div className="space-y-6">
            {profile.card_families.map((family) => (
              <SavedCardFamily
                key={family.parent.id}
                readOnly
                parent={family.parent}
                children={family.children}
              />
            ))}
          </div>
        ) : profile.experience_cards.length === 0 ? (
          <div className="text-center py-8 rounded-lg border border-dashed border-border/60">
            <Briefcase className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No experience cards shared.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {profile.experience_cards.map((card) => (
              <SavedCardFamily
                key={card.id}
                readOnly
                parent={card}
                children={[]}
              />
            ))}
          </div>
        )}
      </section>

      {(profile.open_to_work || profile.open_to_contact || contactUnlocked) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                <Mail className="h-4 w-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-base">Contact</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {contactUnlocked ? (
              <div className="space-y-2">
                {(profile.contact?.email != null && profile.contact.email !== "") || profile.contact?.email_visible ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-foreground">
                      {profile.contact?.email || "Email visible to you"}
                    </span>
                  </div>
                ) : null}
                {profile.contact?.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-foreground">{profile.contact.phone}</span>
                  </div>
                )}
                {profile.contact?.linkedin_url && (
                  <div className="flex items-center gap-2 text-sm">
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
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                  <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center shrink-0">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span>Unlock email, phone, and links (1 credit)</span>
                </div>
                <Button
                  size="default"
                  onClick={() => unlockMutation.mutate()}
                  disabled={unlockMutation.isPending}
                  className="gap-2"
                >
                  {unlockMutation.isPending ? (
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  ) : null}
                  {unlockMutation.isPending ? "Unlocking..." : "Unlock contact"}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">One-time use per search. Credits apply.</p>
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
