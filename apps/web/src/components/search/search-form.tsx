"use client";

import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Coins, Mic, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { apiWithIdempotency } from "@/lib/api";
import { useCredits } from "@/hooks";
import { useVoiceDictation } from "@/hooks/use-voice-dictation";
import { useLanguage } from "@/contexts";
import { ErrorMessage } from "@/components/feedback";
import { cn } from "@/lib/utils";
import type { SearchResponse } from "@/lib/types";

type SearchFormProps = {
  query: string;
  setQuery: (q: string) => void;
  error: string | null;
  onSuccess: (data: SearchResponse) => void;
  onError: (message: string) => void;
};

export function SearchForm({
  query,
  setQuery,
  error,
  onSuccess,
  onError,
}: SearchFormProps) {
  const { data: credits } = useCredits();
  const { language } = useLanguage();

  const voice = useVoiceDictation({
    query,
    setQuery,
    languageCode: language,
  });

  const searchMutation = useMutation({
    mutationFn: async (q: string) => {
      const idempotencyKey = `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return apiWithIdempotency<SearchResponse>("/search", idempotencyKey, {
        method: "POST",
        body: { query: q, language: language },
      });
    },
    onSuccess: (data) => {
      onSuccess(data);
    },
    onError: (e: Error) => {
      onError(e.message);
    },
  });

  const boxText = voice.displayValue;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = boxText.trim();
    if (!q) return;
    searchMutation.mutate(q);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            Search by intent
          </CardTitle>
          <CardDescription>
            e.g. &quot;Someone with 3+ years quant research, persistent mindset, and production experience&quot;
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-3">
            <div>
              <Label htmlFor="query" className="sr-only">
                Search
              </Label>
              <div className="flex gap-2 items-stretch">
                <input
                  id="query"
                  type="text"
                  placeholder="Describe who you're looking for..."
                  value={boxText}
                  readOnly={voice.isRecording}
                  onChange={(e) => {
                    if (voice.isRecording) return;
                    voice.clearError();
                    voice.resetChunks();
                    setQuery(e.target.value);
                  }}
                  className="flex h-11 min-h-[44px] min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-foreground/30 transition-colors"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={voice.isTranscribing}
                  aria-pressed={voice.isRecording}
                  aria-label={
                    voice.isRecording ? "Stop recording and transcribe" : "Record voice query"
                  }
                  onClick={() => voice.toggleRecording()}
                  className={cn(
                    "shrink-0",
                    voice.isRecording &&
                      "border-destructive/50 text-destructive animate-pulse shadow-[0_0_0_1px_hsl(var(--destructive)/0.25)]"
                  )}
                >
                  {voice.isTranscribing ? (
                    <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                  ) : voice.isRecording ? (
                    <Square className="h-4 w-4 fill-current" aria-hidden />
                  ) : (
                    <Mic className="h-4 w-4" aria-hidden />
                  )}
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">
                Mic: live preview in Chrome/Edge; stop to transcribe on the server. Edit, then search.
              </p>
            </div>
            {voice.error ? <ErrorMessage message={voice.error} /> : null}
            {error ? <ErrorMessage message={error} /> : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                disabled={
                  searchMutation.isPending ||
                  !boxText.trim() ||
                  voice.isRecording ||
                  voice.isTranscribing
                }
              >
                {searchMutation.isPending ? "Searching..." : "Search"}
              </Button>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Coins className="h-3.5 w-3.5" />
                1 credit per card shown (e.g. &quot;give me 2 cards&quot; -&gt; 2 credits)
                <span className="text-foreground font-medium tabular-nums">
                  ({credits?.balance ?? "--"} remaining)
                </span>
              </span>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
