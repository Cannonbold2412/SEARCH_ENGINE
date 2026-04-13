"use client";

import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dispatch, SetStateAction } from "react";

type BuilderChatFooterProps = {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  sendMessage: (overrideText?: string) => void;
  loading: boolean;
  voiceConnected: boolean;
  sttMuted: boolean;
  voiceError: string | null;
  surfacedInsights: string[];
};

export function BuilderChatFooter({
  input,
  setInput,
  sendMessage,
  loading,
  voiceConnected,
  sttMuted,
  voiceError,
  surfacedInsights,
}: BuilderChatFooterProps) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 border-t border-border/60 flex-shrink-0">
      {surfacedInsights.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">What I&apos;m noticing</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {surfacedInsights.map((insight) => (
              <span key={insight} className="rounded-full bg-background px-2 py-1 text-xs text-foreground border border-border/60">
                {insight}
              </span>
            ))}
          </div>
        </div>
      )}
      {voiceError && (
        <p className="text-xs text-destructive text-center" role="alert">
          {voiceError}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <textarea
            placeholder={voiceConnected && !sttMuted ? "Voice active — or type here..." : "Type here..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            rows={2}
            className="min-h-[44px] max-h-[120px] w-full resize-none rounded-xl border border-input/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={loading}
          />
          {voiceConnected && !sttMuted ? (
            <p className="mb-0 px-3 text-left text-[11px] text-muted-foreground">
              Voice active — speak naturally or type. Tap the orb to mute mic.
            </p>
          ) : voiceConnected && sttMuted ? (
            <p className="mb-0 px-3 text-left text-[11px] text-muted-foreground">
              Mic muted — type your response. Tap the orb to unmute.
            </p>
          ) : (
            <p className="mb-0 px-3 text-left text-[11px] text-muted-foreground">Connecting voice...</p>
          )}
        </div>
        <Button
          type="button"
          size="icon"
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          className="h-11 w-full shrink-0 sm:w-11"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
