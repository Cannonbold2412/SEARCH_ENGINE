"use client";

import { useCallback, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send } from "lucide-react";
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
    <div className="relative flex flex-col h-full min-h-0 rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border/60">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Answer questions — your card updates on the left as you go. Voice edits stay local until you
              save. Tap the sphere to start or end the call.
            </p>
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

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 scrollbar-thin scrollbar-theme">
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
                  "max-w-[90%] rounded-2xl px-4 py-2.5 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-foreground"
                )}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isSending && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2.5 bg-muted/60 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Updating your card…</span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {onVoiceToggle && !voiceDisabled && (
        <div className="pointer-events-none absolute bottom-10 right-3 z-20 overflow-visible">
          <AiSphere
            intensity={voiceSphereIntensity}
            active={voiceSphereActive}
            size={56}
            onClick={onVoiceToggle}
            className="pointer-events-auto"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5 px-3 py-2 border-t border-border/60 flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
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
            className="shrink-0 h-11 w-11"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
