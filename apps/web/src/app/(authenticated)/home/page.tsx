"use client";

import { useRef, useEffect, useCallback } from "react";
import { Send, X, Coins } from "lucide-react";
import { useSearch } from "@/contexts/search-context";
import { SearchResults } from "@/components/search";
import { ErrorMessage } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { useCredits } from "@/hooks";

const SUGGESTIONS = [
  "Software engineers in San Francisco",
  "Product managers open to work",
  "Designers with UX experience",
  "Data scientists in NYC",
  "Marketing leads at startups",
];

export default function HomePage() {
  const {
    query,
    setQuery,
    searchId,
    people: searchPeople,
    error: searchError,
    performSearch,
    performSearchWithQuery,
    isSearching,
  } = useSearch();
  const { data: credits } = useCredits();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    const id = setTimeout(autoResize, 0);
    return () => clearTimeout(id);
  }, [query, autoResize]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      performSearch();
    }
  };

  const handleSuggestionClick = (text: string) => {
    performSearchWithQuery(text);
  };

  const handleClearSearch = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  const hasSearched = !!searchId;
  const showEmptyState = !hasSearched && !isSearching;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -my-6 -mx-4 sm:-mx-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {searchError && (
          <div className="container max-w-3xl mx-auto px-4 pt-4">
            <ErrorMessage message={searchError} />
          </div>
        )}

        {isSearching && !hasSearched ? (
          <div className="container max-w-6xl mx-auto px-4 py-6">
            <div className="space-y-4">
              <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="rounded-xl border border-border/60 p-4 sm:p-6 animate-pulse">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-4 w-28 bg-muted rounded" />
                        <div className="h-3 w-full max-w-[180px] bg-muted rounded" />
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                      <div className="h-3 w-24 bg-muted rounded" />
                      <div className="h-3 w-full bg-muted rounded" />
                      <div className="h-3 w-[85%] bg-muted rounded" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : showEmptyState ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 py-12">
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground text-center mb-2">
              Who are you looking for?
            </h1>
            <p className="text-muted-foreground text-sm text-center mb-2 max-w-md">
              Describe the people you want to find. Try skills, roles, locations, or open-to-work.
            </p>
            <p className="text-muted-foreground/70 text-xs text-center mb-8 max-w-md">
              Results are saved under Searches so you can revisit them anytime.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSuggestionClick(s)}
                  className="px-4 py-2 rounded-full text-sm bg-muted/80 hover:bg-muted text-foreground/90 hover:text-foreground border border-zinc-700/80 hover:border-zinc-700/100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="container max-w-6xl mx-auto px-4 py-6 space-y-4">
            <SearchResults searchId={searchId} people={searchPeople} />
          </div>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-border/60 bg-background">
        <div className="container max-w-3xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <form
            onSubmit={handleSubmit}
            className="relative flex flex-col sm:flex-row sm:items-end gap-2 rounded-2xl border border-border/60 bg-muted/30 hover:bg-muted/50 focus-within:bg-muted/50 focus-within:ring-1 focus-within:ring-ring/30 transition-all shadow-sm"
          >
            <div className="relative flex-1 w-full min-w-0">
              <textarea
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe who you're looking for..."
                rows={1}
                className="w-full min-h-[48px] sm:min-h-[52px] max-h-[200px] resize-none rounded-2xl bg-transparent pl-4 pr-24 sm:pr-28 py-3 sm:py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none overflow-y-auto"
                style={{ maxHeight: 200 }}
              />
              <div className="absolute right-2 bottom-2 top-2 sm:top-auto flex items-center gap-1">
                {query.trim() && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="h-8 w-8 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <Button
                  type="submit"
                  size="icon"
                  disabled={isSearching || !query.trim()}
                  className="h-9 w-9 min-h-[44px] min-w-[44px] rounded-xl shrink-0"
                >
                  {isSearching ? (
                    <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </form>
          <p className="text-[11px] text-center mt-2 text-muted-foreground flex items-center justify-center gap-1.5">
            <Coins className="h-3 w-3" />
            1 credit per result · {credits?.balance ?? "--"} remaining
          </p>
        </div>
      </div>
    </div>
  );
}
