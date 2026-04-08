"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Trash2, Users, ChevronLeft } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SavedSearchesResponse, PersonSearchResult } from "@/lib/types";
import { PageError, PageLoading } from "@/components/feedback";
import { PersonResultCard } from "@/components/search/person-result-card";
import { useLanguage } from "@/contexts/language-context";

const MAX_STORED_RESULTS = 24;
const EMPTY_SEARCHES: SavedSearchesResponse["searches"] = [];

function formatSearchDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (sameDay) return "Today";
  if (isYesterday) return "Yesterday";
  if (diffDays >= 1 && diffDays < 7) return `${diffDays} days ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function ResultSkeleton() {
  return (
    <li className="rounded-xl border border-border/60 bg-card p-4 sm:p-6 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-muted flex-shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-20 bg-muted rounded" />
          <div className="h-3 w-full max-w-[180px] bg-muted rounded" />
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
        <div className="h-3 w-24 bg-muted rounded" />
        <div className="h-3 w-full bg-muted rounded" />
        <div className="h-3 w-[85%] bg-muted rounded" />
      </div>
    </li>
  );
}

export default function SearchesPage() {
  return (
    <Suspense fallback={<PageLoading message="Loading searches..." />}>
      <SearchesPageContent />
    </Suspense>
  );
}

function SearchesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const selectedSearchId = searchParams.get("id");

  const queryClient = useQueryClient();
  const { data: searchesData, isLoading: isLoadingSearches, error } = useQuery({
    queryKey: ["me", "searches"],
    queryFn: () => api<SavedSearchesResponse>("/me/searches?limit=200"),
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteSearchMutation = useMutation({
    mutationFn: (searchId: string) =>
      api(`/me/searches/${encodeURIComponent(searchId)}`, { method: "DELETE" }),
    onMutate: async (searchId: string) => {
      setConfirmDeleteId(null);
      await queryClient.cancelQueries({ queryKey: ["me", "searches"] });
      const prev = queryClient.getQueryData<SavedSearchesResponse>(["me", "searches"]);
      if (prev?.searches) {
        queryClient.setQueryData<SavedSearchesResponse>(["me", "searches"], {
          ...prev,
          searches: prev.searches.filter((s) => s.id !== searchId),
        });
      }
      return { prev };
    },
    onError: (_err, _searchId, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["me", "searches"], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["me", "searches"] });
    },
  });

  const searches = searchesData?.searches ?? EMPTY_SEARCHES;
  const selectedSearch = searches.find((s) => s.id === selectedSearchId);

  useEffect(() => {
    if (searches.length === 0) return;
    if (selectedSearchId && selectedSearch) return;
    const firstId = searches[0].id;
    router.replace(`/searches?id=${encodeURIComponent(firstId)}`, { scroll: false });
  }, [searches, selectedSearchId, selectedSearch, router]);

  const { data: peopleData, isLoading: isLoadingResults } = useQuery({
    queryKey: ["search", selectedSearchId, "history", language],
    queryFn: async () => {
      if (!selectedSearchId || !selectedSearch) return { people: [] };
      if (selectedSearch.result_count <= 0) return { people: [] };
      const limit = Math.min(MAX_STORED_RESULTS, selectedSearch.result_count);
      return api<{ people: PersonSearchResult[] }>(
        `/search/${selectedSearchId}/more?offset=0&limit=${limit}&history=true&language=${encodeURIComponent(language)}`
      );
    },
    enabled: !!selectedSearchId && !!selectedSearch && !selectedSearch.expired,
  });

  const people = peopleData?.people ?? [];

  const handleDeleteClick = (searchId: string) => {
    if (confirmDeleteId === searchId) {
      deleteSearchMutation.mutate(searchId);
      if (selectedSearchId === searchId && searches.length > 1) {
        const next = searches.find((s) => s.id !== searchId);
        if (next) router.replace(`/searches?id=${encodeURIComponent(next.id)}`, { scroll: false });
      }
    } else {
      setConfirmDeleteId(searchId);
      setTimeout(() => setConfirmDeleteId((prev) => (prev === searchId ? null : prev)), 3000);
    }
  };

  if (isLoadingSearches) {
    return <PageLoading message="Loading searches..." />;
  }

  if (error) {
    return (
      <PageError
        message={error instanceof Error ? error.message : "Failed to load your searches."}
        backHref="/home"
        backLabel="Back to Home"
      />
    );
  }

  const showMobileList = !selectedSearchId || searches.length === 0;

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col md:flex-row"
      role="application"
      aria-label="Your searches"
    >
      <aside
        className={cn(
          "flex h-full min-h-0 flex-shrink-0 flex-col border-border/60 bg-background",
          "w-full border-b md:w-52 md:border-b-0 md:border-r lg:w-60",
          !showMobileList && "hidden md:flex"
        )}
        aria-label="Saved searches"
      >
        <div className="flex-shrink-0 border-b border-border/60 px-3 py-3 sm:px-4">
          <h2 className="text-sm font-semibold text-foreground">Your Searches</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {searches.length === 0 ? "No searches yet" : `${searches.length} ${searches.length === 1 ? "search" : "searches"}`}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain py-2 [-webkit-overflow-scrolling:touch]">
          {searches.length === 0 ? (
            <div className="px-3 py-8 text-center sm:px-4">
              <p className="text-sm text-muted-foreground">
                Searches you run from Home appear here so you can revisit results.
              </p>
              <Link
                href="/home"
                className="mt-4 inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-primary hover:underline"
              >
                <Search className="h-4 w-4" />
                Run your first search
              </Link>
            </div>
          ) : (
          <ul className="space-y-0.5 px-1.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-2 md:pb-2" role="list">
              {searches.map((search) => {
                const isActive = selectedSearchId === search.id;
                const isConfirming = confirmDeleteId === search.id;
                return (
                  <li key={search.id}>
                    <div className={cn("flex items-stretch rounded-lg group/item touch-manipulation", isActive && "bg-accent")}>
                      <Link
                        href={`/searches?id=${encodeURIComponent(search.id)}`}
                        title={search.query_text}
                        className={cn(
                          "flex min-h-[52px] flex-1 flex-col justify-center gap-0.5 rounded-l-lg px-3 py-2.5 text-left transition-colors",
                          isActive
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        )}
                        aria-current={isActive ? "true" : undefined}
                      >
                        <span className="line-clamp-2 text-sm font-medium leading-snug break-words md:line-clamp-1 md:break-normal">
                          {search.query_text}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {search.result_count} {search.result_count === 1 ? "result" : "results"} ·{" "}
                          {formatSearchDate(search.created_at)}
                        </span>
                      </Link>
                      <div className="relative flex-shrink-0 flex items-center pr-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteClick(search.id);
                          }}
                          className={cn(
                            "h-8 w-8 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-all",
                            isConfirming
                              ? "bg-destructive/10 text-destructive"
                              : "text-muted-foreground opacity-100 hover:text-destructive md:opacity-0 md:group-hover/item:opacity-100 md:focus:opacity-100"
                          )}
                          aria-label={isConfirming ? "Confirm delete" : "Delete search"}
                          title={isConfirming ? "Click again to confirm" : "Delete search"}
                          disabled={deleteSearchMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <div
        className={cn("flex min-h-0 min-w-0 flex-1 flex-col", showMobileList && "hidden md:flex")}
      >
        <AnimatePresence mode="wait">
          {!selectedSearchId || searches.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 items-center justify-center p-6 sm:p-8"
            >
              <div className="max-w-sm text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Select a search from the list to view its results.
                </p>
                <Link
                  href="/home"
                  className="mt-4 inline-flex min-h-[44px] items-center justify-center text-sm font-medium text-primary hover:underline"
                >
                  Go to Home
                </Link>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={selectedSearchId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div className="sticky top-0 z-10 flex shrink-0 items-center border-b border-border/60 bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
                <div className="flex w-full min-w-0 items-start gap-2">
                  <button
                    type="button"
                    onClick={() => router.push("/searches")}
                    className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground md:hidden"
                    aria-label="Back to search list"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p
                      className="line-clamp-2 break-words text-sm font-medium text-foreground md:line-clamp-1 md:break-normal"
                      title={selectedSearch?.query_text}
                    >
                      {selectedSearch?.query_text ?? "Search results"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {isLoadingResults ? "Loading..." : `${people.length} of ${selectedSearch?.result_count ?? 0} profiles`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(1rem+env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]">
                <div className="mx-auto w-full max-w-5xl px-2 py-4 sm:px-4 sm:py-6">
                {isLoadingResults ? (
                  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <ResultSkeleton key={i} />
                    ))}
                  </ul>
                ) : people.length === 0 ? (
                  <div className="py-12 text-center sm:py-16">
                    <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-foreground">
                      {selectedSearch?.expired ? "This search has expired" : "No profiles in this search"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedSearch?.expired
                        ? "Results expire after a period of inactivity."
                        : "Run a new search from Home to find people."}
                    </p>
                    <Link
                      href="/home"
                      className="mt-4 inline-flex min-h-[44px] items-center justify-center text-sm font-medium text-primary hover:underline"
                    >
                      Go to Home
                    </Link>
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" role="list">
                    {people.map((person, i) => (
                      <PersonResultCard key={person.id} person={person} searchId={selectedSearchId} index={i} />
                    ))}
                  </ul>
                )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
