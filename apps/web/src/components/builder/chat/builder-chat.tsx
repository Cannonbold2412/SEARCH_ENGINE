"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXPERIENCE_CARD_FAMILIES_QUERY_KEY, EXPERIENCE_CARDS_QUERY_KEY } from "@/hooks";
import { AUTH_TOKEN_KEY } from "@/lib/auth-flow";
import { API_BASE } from "@/lib/constants";
import { api } from "@/lib/api";
import { createPatchedVapiClient, isBenignVapiDisconnectError, preloadVapiWeb, type VapiClient } from "@/lib/vapi-client";
import { cn } from "@/lib/utils";
import { AiSphere } from "../ai-sphere";

const BUILDER_SESSION_STORAGE_KEY = "builder-session-id";

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export type ClarifyHistoryEntry = {
  role: string;
  kind: "clarify_question" | "clarify_answer";
  target_type?: string | null;
  target_field?: string | null;
  target_child_type?: string | null;
  profile_axes?: string[] | null;
  text: string;
};

export type ClarifyOption = { parent_id: string; label: string };

type BuilderTurn = {
  id: string;
  role: "assistant" | "user";
  content: string;
  turn_index: number;
  message_type?: string | null;
};

type BuilderChatTurnResponse = {
  session_id: string;
  assistant_message: string;
  working_narrative?: string | null;
  surfaced_insights?: string[];
  should_continue: boolean;
  session_status: string;
  ready_to_commit: boolean;
};

type BuilderSessionResponse = {
  session_id: string;
  mode: "text" | "voice";
  session_status: string;
  current_focus?: string | null;
  working_narrative?: string | null;
  turn_count: number;
  stop_confidence: number;
  surfaced_insights: string[];
  should_continue: boolean;
  ready_to_commit: boolean;
  turns: BuilderTurn[];
};

function isTranscriptMessage(msg: unknown): msg is { type?: string; role?: string; transcriptType?: string; transcript?: string } {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  const type = String(m.type ?? "").toLowerCase();
  const hasText = typeof (m.transcript ?? m.content) === "string";
  // Vapi may use different type strings for transcripts; accept anything that
  // clearly contains transcript text and whose type either is empty or mentions "transcript".
  return hasText && (!type || type.includes("transcript"));
}

function ScrollToBottomButton({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = scrollRef.current?.parentElement;
    if (!el) return;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShow(distanceFromBottom > 120);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [scrollRef]);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => scrollRef.current?.scrollIntoView({ behavior: "smooth" })}
      className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-full bg-background/90 border border-border shadow-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Scroll to bottom"
    >
      <ArrowDown className="h-3 w-3" />
      New messages
    </button>
  );
}

interface BuilderChatProps {
  onCardsSaved?: () => void;
}

export function BuilderChat({ onCardsSaved }: BuilderChatProps) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Used to merge multiple transcript "chunks" into one assistant bubble
  // during a single speech segment.
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const committedAssistantTextRef = useRef("");
  // Used to merge multiple transcript "chunks" into one user bubble
  // during a single spoken turn.
  const activeUserMessageIdRef = useRef<string | null>(null);
  const committedUserTextRef = useRef("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [surfacedInsights, setSurfacedInsights] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Voice state (Vapi integration)
  const vapiRef = useRef<VapiClient | null>(null);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  // Default the orb to \"AI speaking\" so the sphere feels alive on first load.
  const [aiSpeaking, setAiSpeaking] = useState(true);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Sphere intensity derived from voice state
  const sphereActive = voiceConnecting
    ? "connecting" as const
    : aiSpeaking
    ? "ai" as const
    : userSpeaking || voiceConnected
    ? "user" as const
    : "idle" as const;

  const sphereIntensity = aiSpeaking ? 0.85 : userSpeaking ? 0.7 : voiceConnected ? 0.25 : 0;

  useEffect(() => {
    let cancelled = false;
    const storedSessionId =
      typeof window !== "undefined" ? sessionStorage.getItem(BUILDER_SESSION_STORAGE_KEY) : null;
    if (!storedSessionId) return;

    (async () => {
      try {
        const session = await api<BuilderSessionResponse>(`/builder/session/${storedSessionId}`);
        if (cancelled) return;
        setSessionId(session.session_id);
        setSurfacedInsights(session.surfaced_insights ?? []);
        if (session.turns.length > 0) {
          setMessages(
            session.turns.map((turn) => ({
              id: turn.id,
              role: turn.role,
              content: turn.content,
            }))
          );
        }
      } catch {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(BUILDER_SESSION_STORAGE_KEY);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const resetVoiceState = useCallback(() => {
    setVoiceConnecting(false);
    setVoiceConnected(false);
    setAiSpeaking(false);
    setUserSpeaking(false);
    activeAssistantMessageIdRef.current = null;
    committedAssistantTextRef.current = "";
    activeUserMessageIdRef.current = null;
    committedUserTextRef.current = "";
  }, []);

  const detachVoice = useCallback((target?: VapiClient | null) => {
    if (!target || vapiRef.current === target) {
      vapiRef.current = null;
    }
    resetVoiceState();
  }, [resetVoiceState]);

  const addMessage = useCallback((msg: Omit<ChatMessage, "id">) => {
    setMessages((prev) => [...prev, { ...msg, id: String(prev.length + Date.now()) }]);
  }, []);

  // Voice: stop existing Vapi connection
  const stopVoice = useCallback(() => {
    const vapi = vapiRef.current;
    detachVoice(vapi);
    if (!vapi) return;
    void vapi.stop().catch((error) => {
      if (!isBenignVapiDisconnectError(error)) {
        setVoiceError(error instanceof Error ? error.message : "Could not end voice session");
      }
    });
  }, [detachVoice]);

  // Cleanup Vapi on unmount
  useEffect(() => {
    return () => {
      if (vapiRef.current) {
        stopVoice();
      }
    };
  }, [stopVoice]);

  // Voice: start Vapi connection
  const startVoice = useCallback(async () => {
    if (vapiRef.current) return;
    setVoiceError(null);
    setVoiceConnecting(true);
    let vapi: VapiClient | null = null;

    const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) {
      setVoiceError("Please sign in to use voice");
      setVoiceConnecting(false);
      return;
    }
    if (!API_BASE || !API_BASE.startsWith("http")) {
      setVoiceError("API not configured");
      setVoiceConnecting(false);
      return;
    }

    try {
      const proxyBase = `${API_BASE}/convai`;
      vapi = await createPatchedVapiClient(token, proxyBase);
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
        setVoiceConnecting(false);
        setVoiceConnected(true);
        setVoiceError(null);
      });

      vapi.on("call-end", () => {
        detachVoice(vapi);
        queryClient.invalidateQueries({ queryKey: [EXPERIENCE_CARD_FAMILIES_QUERY_KEY] });
      });

      vapi.on("speech-start", () => {
        setAiSpeaking(true);
        activeAssistantMessageIdRef.current = null;
        committedAssistantTextRef.current = "";
        activeUserMessageIdRef.current = null;
        committedUserTextRef.current = "";
        setUserSpeaking(false);
      });
      vapi.on("speech-end", () => {
        setAiSpeaking(false);
        activeAssistantMessageIdRef.current = null;
        committedAssistantTextRef.current = "";
      });

      vapi.on("message", (msg: unknown) => {
        const m = msg as Record<string, unknown>;
        const transcriptType = String(m.transcriptType ?? "").toLowerCase();
        const isPartial = transcriptType && transcriptType !== "final";
        const transcriptAny = m.transcript as unknown;
        const transcriptFieldType =
          transcriptAny == null ? "null" : Array.isArray(transcriptAny) ? "array" : typeof transcriptAny;

        // Transcript may be a string or an object (provider-dependent). We only use lengths/metadata in logs, never speech text.
        let rawTextSource: string | null = null;
        let rawText: string | undefined;

        const assignIfString = (candidate: unknown, source: string) => {
          if (typeof candidate === "string" && candidate.trim().length > 0) {
            rawTextSource = source;
            rawText = candidate;
            return true;
          }
          return false;
        };

        if (assignIfString(m.transcript, "transcript")) {
          // assigned
        } else if (transcriptAny && typeof transcriptAny === "object") {
          const ta = transcriptAny as any;
          assignIfString(ta.text, "transcript.text") ||
            assignIfString(ta.transcript, "transcript.transcript") ||
            assignIfString(ta.value, "transcript.value");

          const scanArray = (arr: unknown, sourcePrefix: string) => {
            if (!Array.isArray(arr)) return false;
            for (let i = 0; i < arr.length; i++) {
              const item = arr[i] as any;
              if (typeof item === "string" && item.trim().length > 0) {
                rawTextSource = `${sourcePrefix}[${i}]`;
                rawText = item;
                return true;
              }
              if (item && typeof item === "object") {
                if (typeof item.text === "string" && item.text.trim().length > 0) {
                  rawTextSource = `${sourcePrefix}[${i}].text`;
                  rawText = item.text;
                  return true;
                }
                if (typeof item.transcript === "string" && item.transcript.trim().length > 0) {
                  rawTextSource = `${sourcePrefix}[${i}].transcript`;
                  rawText = item.transcript;
                  return true;
                }
              }
            }
            return false;
          };

          if (!rawText) {
            scanArray(ta.chunks, "transcript.chunks") ||
              scanArray(ta.segments, "transcript.segments") ||
              scanArray(ta.alternatives, "transcript.alternatives");
          }
        }

        if (!rawText) {
          assignIfString(m.content, "content") ||
            assignIfString(m.text, "text") ||
            (Array.isArray((m as any).alternatives) && typeof (m as any).alternatives[0]?.text === "string"
              ? assignIfString((m as any).alternatives[0]?.text, "alternatives[0].text")
              : false);
        }

        const text = (rawText ?? "").toString();
        // Treat any non-"assistant" transcript as coming from the user so user speech
        // always appears on the right-hand side.
        const role = m.role === "assistant" ? "assistant" : "user";
        const t = text.trim();
        if (!t) {
          return;
        }
        // IMPORTANT: Do not mutate active bubble IDs on transcript-less/status events.
        // Those events are common mid-call and clearing them can make bubbles "disappear".
        if (role === "user") setUserSpeaking(true);

        // Transcripts can arrive as multiple events for both roles; update a single
        // bubble per spoken turn. Partial chunks "stream" by replacing content,
        // and final chunks append.
        setMessages((prev) => {
          const mergeText = (oldText: string, nextText: string) => {
            const oldEndsWithSpace = /\s$/.test(oldText);
            const nextStartsWithSpace = /^\s/.test(nextText);
            if (oldText.length === 0) return nextText;
            if (oldEndsWithSpace || nextStartsWithSpace) return oldText + nextText;
            // Heuristic: avoid "wordword" when transcript chunk boundaries drop spaces.
            return oldText + " " + nextText;
          };

          if (role === "user") {
            const activeId = activeUserMessageIdRef.current;
            const activeMsg = activeId ? prev.find((m) => m.id === activeId) : undefined;

            if (activeId && activeMsg) {
              let newContent: string;
              if (isPartial) {
                newContent = committedUserTextRef.current
                  ? mergeText(committedUserTextRef.current, t)
                  : t;
              } else {
                committedUserTextRef.current = committedUserTextRef.current
                  ? mergeText(committedUserTextRef.current, t)
                  : t;
                newContent = committedUserTextRef.current;
              }
              const prevLen = activeMsg.content?.length ?? 0;
              void prevLen;
              return prev.map((m) =>
                m.id === activeId ? { ...m, content: newContent } : m
              );
            }

            const newId = `${Date.now()}-${prev.length}`;
            activeUserMessageIdRef.current = newId;
            committedUserTextRef.current = isPartial ? "" : t;
            return [...prev, { id: newId, role: "user", content: t }];
          }

          const activeId = activeAssistantMessageIdRef.current;
          const activeMsg = activeId ? prev.find((m) => m.id === activeId) : undefined;

          if (activeId && activeMsg) {
            let newContent: string;
            if (isPartial) {
              newContent = committedAssistantTextRef.current
                ? mergeText(committedAssistantTextRef.current, t)
                : t;
            } else {
              committedAssistantTextRef.current = committedAssistantTextRef.current
                ? mergeText(committedAssistantTextRef.current, t)
                : t;
              newContent = committedAssistantTextRef.current;
            }
            const prevLen = activeMsg.content?.length ?? 0;
            void prevLen;
            return prev.map((m) =>
              m.id === activeId ? { ...m, content: newContent } : m
            );
          }

          const newId = `${Date.now()}-${prev.length}`;
          activeAssistantMessageIdRef.current = newId;
          committedAssistantTextRef.current = isPartial ? "" : t;
          return [...prev, { id: newId, role: "assistant", content: t }];
        });
      });

      vapi.on("error", (err) => {
        const errObj = err as Record<string, unknown>;
        const errType = String(errObj?.type ?? "").toLowerCase();
        const topMsg = (err?.message as string) || "";
        const nested = errObj?.error as Record<string, unknown> | undefined;
        const nestedMsg =
          (typeof nested?.errorMsg === "string" && nested.errorMsg) ||
          (nested?.message && typeof nested.message === "object" && typeof (nested.message as Record<string, unknown>)?.msg === "string" && (nested.message as Record<string, unknown>).msg) ||
          (nested?.error && typeof nested.error === "object" && typeof (nested.error as Record<string, unknown>)?.msg === "string" && (nested.error as Record<string, unknown>).msg);
        const errMsg = topMsg || (typeof nestedMsg === "string" ? nestedMsg : "");
        const isLocal = typeof window !== "undefined" && /localhost|127\.0\.0\.1/.test(API_BASE);
        const friendlyMsg =
          errType === "start-method-error" && isLocal
            ? "Voice needs a tunnel. 1) Run ngrok (e.g. .\\scripts\\ngrok-tunnel.ps1 or ngrok http 8000). 2) In apps/api/.env set VAPI_CALLBACK_BASE_URL to the https URL ngrok shows. 3) Restart the API."
            : errMsg || "Voice connection error";
        if (errType === "daily-error" && /meeting has ended/i.test(friendlyMsg)) {
          setVoiceError(null);
          detachVoice(vapi);
          return;
        }
        detachVoice(vapi);
        setVoiceError(friendlyMsg);
      });

      await vapi.start({});
    } catch (e) {
      const isExpectedDisconnect = isBenignVapiDisconnectError(e);
      if (isExpectedDisconnect) {
        setVoiceError(null);
        detachVoice(vapi);
        return;
      }
      detachVoice(vapi);
      setVoiceError(e instanceof Error ? e.message : "Could not start voice session");
    }
  }, [detachVoice, queryClient]);

  const startVoiceRef = useRef(startVoice);

  useEffect(() => {
    startVoiceRef.current = startVoice;
  }, [startVoice]);

  // Voice: toggle connection from the sphere
  const toggleVoice = useCallback(async () => {
    if (voiceConnected && vapiRef.current) {
      stopVoice();
      return;
    }
    await startVoice();
  }, [voiceConnected, startVoice, stopVoice]);

  // Auto-start voice on initial load so the AI is on by default.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        // Reduce time-to-`call-start` by ensuring the Vapi Web SDK is loaded
        // before we invoke the existing `startVoice()` flow.
        try {
          await preloadVapiWeb();
        } catch {
          // If preload fails, we still want the normal voice start path to run.
        }
        void startVoiceRef.current();
      })();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText !== undefined ? overrideText : input).trim();
    if (!text || loading) return;
    setInput("");
    addMessage({ role: "user", content: text });
    setLoading(true);
    try {
      const res = await api<BuilderChatTurnResponse>("/builder/chat/turn", {
        method: "POST",
        body: {
          session_id: sessionId,
          message: text,
          mode: "text",
        },
      });

      setSessionId(res.session_id);
      setSurfacedInsights(res.surfaced_insights ?? []);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(BUILDER_SESSION_STORAGE_KEY, res.session_id);
      }

      addMessage({
        role: "assistant",
        content: res.assistant_message || "Tell me a little more about that.",
      });

      if (res.session_status === "committed") {
        queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARDS_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY });
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(BUILDER_SESSION_STORAGE_KEY);
        }
        setSessionId(null);
        onCardsSaved?.();
      }
    } catch {
      addMessage({
        role: "assistant",
        content: "I lost the thread for a second. Try saying that again in your own words.",
      });
    } finally {
      setLoading(false);
    }
  }, [
    input,
    loading,
    sessionId,
    addMessage,
    queryClient,
    onCardsSaved,
  ]);

  return (
    <div className="relative flex flex-col h-full min-h-0 rounded-xl border border-border bg-card overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-foreground"
                )}
              >
                <p className="whitespace-pre-wrap break-words">
                  {msg.content}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2.5 bg-muted/60 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Thinking…</span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Scroll-to-bottom pill */}
      <ScrollToBottomButton scrollRef={scrollRef} />

      {/* Free-floating sphere */}
      <div className="pointer-events-none absolute bottom-10 right-3 z-20 overflow-visible">
        <AiSphere
          intensity={sphereIntensity}
          active={sphereActive}
          size={56}
          onClick={toggleVoice}
          className="pointer-events-auto"
        />
      </div>

      {/* Footer: text input + send (no sphere here) */}
      <div className="flex flex-col gap-1.5 px-3 py-2 border-t border-border flex-shrink-0">
        {surfacedInsights.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">What I’m noticing</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {surfacedInsights.map((insight) => (
                <span
                  key={insight}
                  className="rounded-full bg-background px-2 py-1 text-xs text-foreground border border-border/60"
                >
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
        <div className="flex items-end gap-2">
          <textarea
            placeholder={voiceConnected ? "Voice active — or type here…" : "Type here…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            rows={2}
            className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={loading}
          />
          <Button
            type="button"
            size="icon"
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="shrink-0 h-11 w-11"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {voiceConnected && (
          <p className="text-[11px] text-center text-muted-foreground mb-0">
            Voice connected — speak naturally or type. Tap the orb to turn voice off.
          </p>
        )}
        {!voiceConnected && (
          <p className="text-[11px] text-center text-muted-foreground mb-0">
            Voice is off — tap the orb to turn it back on, or just type.
          </p>
        )}
      </div>
    </div>
  );
}
