"use client";

import { useCallback, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AiSphere } from "@/components/builder/ai-sphere";

export type EnhanceChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type EnhanceChatPanelProps = {
  title?: string;
  messages: EnhanceChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  isSending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  voiceError?: string | null;
  voiceConfigured?: boolean;
  onVoiceToggle?: () => void;
  voiceDisabled?: boolean;
  voiceSphereIntensity?: number;
  voiceSphereActive?: "idle" | "user" | "ai" | "connecting";
  sttMuted?: boolean;
  voiceActive?: boolean;
};

export function EnhanceChatPanel({
  title = "Enhance assistant",
  messages,
  input,
  onInputChange,
  onSend,
  isSending = false,
  disabled = false,
  placeholder = "Answer here…",
  voiceError = null,
  voiceConfigured = false,
  onVoiceToggle,
  voiceDisabled = false,
  voiceSphereIntensity = 0,
  voiceSphereActive = "idle",
  sttMuted = false,
  voiceActive = false,
}: EnhanceChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, isSending]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending || disabled) return;
    await onSend();
  }, [input, isSending, disabled, onSend]);

  return (
    <div className="relative flex h-full min-h-[20rem] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm">
      <div className="flex-shrink-0 border-b border-border/60 px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {voiceActive && !sttMuted
                ? "Voice active — speak naturally or type. Tap the orb to mute mic. Card saves automatically when the call ends."
                : voiceActive && sttMuted
                  ? "Mic muted — type your response. Tap the orb to unmute."
                  : "Connecting voice… your card will update live and save when the call ends."}
            </p>
          </div>
          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium",
              voiceActive && !sttMuted
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-500"
                : "border-border/70 bg-muted/40 text-muted-foreground"
            )}
          >
            {voiceActive && !sttMuted ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
            {voiceActive && !sttMuted ? "Listening" : "Muted"}
          </div>
        </div>
        {voiceError && (
          <p className="text-xs text-destructive mt-2" role="alert">
            {voiceError}
          </p>
        )}
        {!voiceConfigured && onVoiceToggle && (
          <p className="text-xs text-muted-foreground mt-2">
            Set <code className="text-[11px]">NEXT_PUBLIC_VAPI_PUBLIC_KEY</code> and{" "}
            <code className="text-[11px]">NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID</code> in{" "}
            <code className="text-[11px]">apps/web/.env.local</code> to enable the edit assistant (client tool{" "}
            <code className="text-[11px]">update_card_draft</code>).
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 space-y-4 overflow-y-auto bg-gradient-to-b from-transparent via-muted/10 to-transparent p-3 scrollbar-thin scrollbar-theme sm:p-4">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[92%] rounded-2xl border px-4 py-2.5 text-sm shadow-sm",
                  msg.role === "user"
                    ? "border-primary/30 bg-primary text-primary-foreground"
                    : "border-border/60 bg-background/90 text-foreground"
                )}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isSending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/90 px-4 py-2.5 text-sm text-muted-foreground shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Updating your card…</span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {onVoiceToggle && !voiceDisabled && (
        <div className="pointer-events-none absolute bottom-20 right-3 z-20 overflow-visible sm:bottom-10">
          <AiSphere
            intensity={voiceSphereIntensity}
            active={voiceSphereActive}
            size={56}
            onClick={onVoiceToggle}
            aria-label={
              !voiceActive
                ? "Connecting voice..."
                : sttMuted
                  ? "Unmute microphone"
                  : "Mute microphone"
            }
            className="pointer-events-auto"
          />
        </div>
      )}

      <div className="flex flex-shrink-0 flex-col gap-1.5 border-t border-border/60 bg-background/95 px-3 py-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label htmlFor="enhance-chat-input" className="sr-only">
            Type your response
          </label>
          <textarea
            id="enhance-chat-input"
            placeholder={placeholder}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={2}
            className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl border border-input/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={disabled || isSending}
          />
          <Button
            type="button"
            size="icon"
            onClick={() => void handleSend()}
            disabled={!input.trim() || disabled || isSending}
            className="h-11 w-full shrink-0 sm:w-11"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
