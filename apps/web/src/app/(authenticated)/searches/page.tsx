"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Trash2, Users, ChevronLeft } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { SavedSearchesResponse, PersonSearchResult } from "@/types";
import { PageError, PageLoading } from "@/components/feedback";
import { PersonResultCard } from "@/components/search/person-result-card";

const MAX_STORED_RESULTS = 24;

function truncateQuery(text: string, maxLen = 44): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + "…";
}

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
    <li className="rounded-xl border border-border bg-card p-4 sm:p-6 animate-pulse">
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
    <Suspense fallback={<PageLoading message="Loading searches…" />}>
      <SearchesPageContent />
    </Suspense>
  );
}

function SearchesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  const searches = searchesData?.searches ?? [];
  const selectedSearch = searches.find((s) => s.id === selectedSearchId);

  useEffect(() => {
    if (searches.length === 0) return;
    if (selectedSearchId && selectedSearch) return;
    const firstId = searches[0].id;
    router.replace(`/searches?id=${encodeURIComponent(firstId)}`, { scroll: false });
  }, [searches, selectedSearchId, selectedSearch, router]);

  const { data: peopleData, isLoading: isLoadingResults } = useQuery({
    queryKey: ["search", selectedSearchId, "history"],
    queryFn: async () => {
      if (!selectedSearchId || !selectedSearch) return { people: [] };
      if (selectedSearch.result_count <= 0) return { people: [] };
      const limit = Math.min(MAX_STORED_RESULTS, selectedSearch.result_count);
      return api<{ people: PersonSearchResult[] }>(
        `/search/${selectedSearchId}/more?offset=0&limit=${limit}&history=true`
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
    return <PageLoading message="Loading searches…" />;
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
    <main className="min-w-0 min-h-[calc(100vh-3.5rem)] flex flex-col md:flex-row" role="application" aria-label="Your searches">
      {/* Left: list of searches */}
      <aside
        className={cn(
          "flex-shrink-0 border-r border-border bg-background flex flex-col min-h-0",
          "w-full md:w-52 lg:w-60",
          !showMobileList && "hidden md:flex"
        )}
        aria-label="Saved searches"
      >
        <div className="flex-shrink-0 px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Your Searches</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {searches.length === 0
              ? "No searches yet"
              : `${searches.length} ${searches.length === 1 ? "search" : "searches"}`}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {searches.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Searches you run from Home appear here so you can revisit results.
              </p>
              <Link
                href="/home"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Search className="h-4 w-4" />
                Run your first search
              </Link>
            </div>
          ) : (
            <ul className="space-y-0.5 px-2" role="list">
              {searches.map((search) => {
                const isActive = selectedSearchId === search.id;
                const isConfirming = confirmDeleteId === search.id;
                return (
                  <li key={search.id}>
                    <div
                      className={cn(
                        "flex items-stretch rounded-lg group/item",
                        isActive && "bg-accent"
                      )}
                    >
                      <Link
                        href={`/searches?id=${encodeURIComponent(search.id)}`}
                        title={search.query_text}
                        className={cn(
                          "flex-1 min-w-0 flex flex-col gap-0.5 px-3 py-2.5 rounded-l-lg text-left transition-colors",
                          "min-h-[52px] justify-center",
                          isActive
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        )}
                        aria-current={isActive ? "true" : undefined}
                      >
                        <span className="truncate text-sm font-medium">
                          {truncateQuery(search.query_text)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {search.result_count} {search.result_count === 1 ? "result" : "results"} · {formatSearchDate(search.created_at)}
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
                              ? "text-destructive bg-destructive/10"
                              : "text-muted-foreground hover:text-destructive opacity-0 group-hover/item:opacity-100 focus:opacity-100"
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

      {/* Right: results for selected search */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 min-h-0",
        showMobileList && "hidden md:flex"
      )}>
        <AnimatePresence mode="wait">
          {!selectedSearchId || searches.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center p-8"
            >
              <div className="text-center max-w-sm">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Select a search from the list to view its results.
                </p>
                <Link href="/home" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
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
              className="flex-1 overflow-y-auto"
            >
              <div className="sticky top-0 z-10 flex-shrink-0 border-b border-border bg-background/95 backdrop-blur py-3 px-4 sm:px-6">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push("/searches")}
                    className="md:hidden p-1 -ml-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Back to search list"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground font-medium truncate" title={selectedSearch?.query_text}>
                      {selectedSearch?.query_text ?? "Search results"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isLoadingResults
                        ? "Loading…"
                        : `${people.length} of ${selectedSearch?.result_count ?? 0} profiles`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="container max-w-5xl mx-auto px-4 sm:px-6 py-6">
                {isLoadingResults ? (
                  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <ResultSkeleton key={i} />
                    ))}
                  </ul>
                ) : people.length === 0 ? (
                  <div className="py-16 text-center">
                    <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground">
                      {selectedSearch?.expired ? "This search has expired" : "No profiles in this search"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedSearch?.expired
                        ? "Results expire after a period of inactivity."
                        : "Run a new search from Home to find people."}
                    </p>
                    <Link
                      href="/home"
                      className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
                    >
                      Go to Home
                    </Link>
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" role="list">
                    {people.map((person, i) => (
                      <PersonResultCard
                        key={person.id}
                        person={person}
                        searchId={selectedSearchId}
                        index={i}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
