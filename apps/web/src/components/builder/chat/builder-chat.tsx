"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Loader2, Send } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EXPERIENCE_CARD_FAMILIES_QUERY_KEY, EXPERIENCE_CARDS_QUERY_KEY } from "@/hooks";
import { AUTH_TOKEN_KEY } from "@/lib/auth-flow";
import { API_BASE } from "@/lib/constants";
import { api } from "@/lib/api";
import { isVapiVoiceConfigured, getVapiAssistantId, getVapiPublicKey } from "@/lib/vapi-config";
import { createPatchedVapiClient, isBenignVapiDisconnectError, preloadVapiWeb, type VapiClient } from "@/lib/vapi-client";
import { cn } from "@/lib/utils";
import { AiSphere } from "../ai-sphere";

const BUILDER_CHAT_STORAGE_KEY = "builder-chat-state";

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

type BuilderSessionCommitResponse = {
  session_id: string;
  session_status: string;
  working_narrative?: string | null;
  committed_card_ids: string[];
  committed_card_count: number;
};

type PersistedBuilderChatState = {
  messages: ChatMessage[];
  surfacedInsights: string[];
};

function serializeTranscriptFromMessages(messages: ChatMessage[]): string {
  return messages
    .map((msg) => {
      const text = String(msg.content ?? "").trim();
      if (!text) return "";
      const role = msg.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}

function collapseAdjacentDuplicatePhrases(text: string): string {
  const tokens = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 2) return text.trim();

  const normalized = (token: string) => token.toLowerCase().replace(/^[^\w]+|[^\w]+$/g, "");
  const maxWindow = Math.min(12, Math.floor(tokens.length / 2));
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < tokens.length - 1; i++) {
      let removed = false;
      for (let size = maxWindow; size >= 1; size--) {
        if (i + size * 2 > tokens.length) continue;
        let equal = true;
        for (let j = 0; j < size; j++) {
          if (normalized(tokens[i + j]) !== normalized(tokens[i + size + j])) {
            equal = false;
            break;
          }
        }
        if (!equal) continue;
        tokens.splice(i + size, size);
        changed = true;
        removed = true;
        break;
      }
      if (removed) break;
    }
  }

  return tokens.join(" ").trim();
}

function mergeTranscriptText(oldText: string, nextText: string): string {
  const oldEndsWithSpace = /\s$/.test(oldText);
  const nextStartsWithSpace = /^\s/.test(nextText);
  if (oldText.length === 0) return collapseAdjacentDuplicatePhrases(nextText);
  const merged = oldEndsWithSpace || nextStartsWithSpace ? oldText + nextText : oldText + " " + nextText;
  // Normalize adjacent duplicated phrases caused by overlapping transcript chunks.
  return collapseAdjacentDuplicatePhrases(merged);
}

type TranscriptRole = "assistant" | "user";

function extractTranscriptText(m: Record<string, unknown>): string {
  let rawText: string | undefined;
  const transcriptAny = m.transcript as unknown;

  const assignIfString = (candidate: unknown): boolean => {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      rawText = candidate;
      return true;
    }
    return false;
  };

  const scanArray = (arr: unknown): boolean => {
    if (!Array.isArray(arr)) return false;
    for (const item of arr) {
      if (assignIfString(item)) return true;
      if (item && typeof item === "object") {
        const typed = item as Record<string, unknown>;
        if (assignIfString(typed.text)) return true;
        if (assignIfString(typed.transcript)) return true;
      }
    }
    return false;
  };

  if (!assignIfString(m.transcript) && transcriptAny && typeof transcriptAny === "object") {
    const transcriptObj = transcriptAny as Record<string, unknown>;
    assignIfString(transcriptObj.text) ||
      assignIfString(transcriptObj.transcript) ||
      assignIfString(transcriptObj.value) ||
      scanArray(transcriptObj.chunks) ||
      scanArray(transcriptObj.segments) ||
      scanArray(transcriptObj.alternatives);
  }

  if (!rawText) {
    const alternatives = m.alternatives as unknown;
    assignIfString(m.content) ||
      assignIfString(m.text) ||
      (Array.isArray(alternatives)
        ? assignIfString((alternatives[0] as Record<string, unknown> | undefined)?.text)
        : false);
  }

  return collapseAdjacentDuplicatePhrases(String(rawText ?? ""));
}

function upsertStreamingTranscriptMessage(
  prev: ChatMessage[],
  role: TranscriptRole,
  text: string,
  isPartial: boolean,
  activeIdRef: React.MutableRefObject<string | null>,
  committedTextRef: React.MutableRefObject<string>
): ChatMessage[] {
  const activeId = activeIdRef.current;
  const activeMessage = activeId ? prev.find((msg) => msg.id === activeId) : undefined;

  if (activeId && activeMessage) {
    let newContent: string;
    if (isPartial) {
      newContent = committedTextRef.current
        ? mergeTranscriptText(committedTextRef.current, text)
        : text;
    } else {
      committedTextRef.current = committedTextRef.current
        ? mergeTranscriptText(committedTextRef.current, text)
        : text;
      newContent = committedTextRef.current;
    }
    return prev.map((msg) => (msg.id === activeId ? { ...msg, content: newContent } : msg));
  }

  const newId = `${Date.now()}-${prev.length}`;
  activeIdRef.current = newId;
  committedTextRef.current = isPartial ? "" : text;
  return [...prev, { id: newId, role, content: text }];
}

function resolveVoiceErrorMessage(error: unknown): string {
  const errObj = error as Record<string, unknown>;
  const topMsg = (error as { message?: string })?.message ?? "";
  const nested = errObj?.error as Record<string, unknown> | undefined;
  const nestedMessageObject = nested?.message as Record<string, unknown> | undefined;
  const nestedErrorObject = nested?.error as Record<string, unknown> | undefined;
  const nestedMsg =
    (typeof nested?.errorMsg === "string" && nested.errorMsg) ||
    (typeof nestedMessageObject?.msg === "string" && nestedMessageObject.msg) ||
    (typeof nestedErrorObject?.msg === "string" && nestedErrorObject.msg);
  const errMsg = topMsg || (typeof nestedMsg === "string" ? nestedMsg : "");
  return errMsg || "Voice connection error";
}

function isAssistantWrapUpTranscript(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  const hasClearPicture =
    normalized.includes("clear picture of that experience") ||
    normalized.includes("clear picture of that") ||
    normalized.includes("i've got a clear picture") ||
    normalized.includes("ive got a clear picture");
  const hasThanks =
    normalized.includes("thank you") ||
    normalized.includes("thanks") ||
    normalized.includes("good luck");

  return hasClearPicture || (hasThanks && normalized.length < 220);
}

function extractVapiCallId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  const directCandidates = [obj.callId, obj.call_id, obj.id];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  const call = obj.call;
  if (call && typeof call === "object") {
    const callObj = call as Record<string, unknown>;
    const nestedCandidates = [callObj.id, callObj.callId, callObj.call_id];
    for (const candidate of nestedCandidates) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  return null;
}

function getCurrentVapiCallId(client: VapiClient | null): string | null {
  if (!client) return null;
  const internal = client as unknown as Record<string, unknown>;
  return extractVapiCallId(internal.call);
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
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  // Used to merge multiple transcript "chunks" into one assistant bubble
  // during a single speech segment.
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const committedAssistantTextRef = useRef("");
  // Used to merge multiple transcript "chunks" into one user bubble
  // during a single spoken turn.
  const activeUserMessageIdRef = useRef<string | null>(null);
  const committedUserTextRef = useRef("");
  const [sessionId] = useState<string | null>(null);
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
  const pendingAutoEndRef = useRef(false);
  const autoEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptCommitInFlightRef = useRef(false);
  const activeVapiCallIdRef = useRef<string | null>(null);

  // Sphere intensity derived from voice state
  const sphereActive = voiceConnecting
    ? "connecting" as const
    : aiSpeaking
    ? "ai" as const
    : userSpeaking || voiceConnected
    ? "user" as const
    : "idle" as const;

  const sphereIntensity = aiSpeaking ? 0.85 : userSpeaking ? 0.7 : voiceConnected ? 0.25 : 0;

  // Restore local chat UI state so switching pages doesn't feel like a reset.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(BUILDER_CHAT_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as PersistedBuilderChatState;
      if (Array.isArray(parsed.messages)) {
        setMessages(parsed.messages);
      }
      if (Array.isArray(parsed.surfacedInsights)) {
        setSurfacedInsights(parsed.surfacedInsights);
      }
    } catch {
      sessionStorage.removeItem(BUILDER_CHAT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const state: PersistedBuilderChatState = {
      messages,
      surfacedInsights,
    };
    sessionStorage.setItem(BUILDER_CHAT_STORAGE_KEY, JSON.stringify(state));
  }, [messages, surfacedInsights]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    messagesRef.current = messages;
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
    pendingAutoEndRef.current = false;
    if (autoEndTimeoutRef.current) {
      clearTimeout(autoEndTimeoutRef.current);
      autoEndTimeoutRef.current = null;
    }
    activeVapiCallIdRef.current = null;
  }, []);

  const addMessage = useCallback((msg: Omit<ChatMessage, "id">) => {
    setMessages((prev) => [...prev, { ...msg, id: String(prev.length + Date.now()) }]);
  }, []);

  const commitVoiceTranscript = useCallback(async (callId: string | null, transcriptFallback: string) => {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/9cd54503-81ee-4381-aec3-f5256557b6dc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({runId:"post-fix",hypothesisId:"H1-H4",location:"builder-chat.tsx:commitVoiceTranscript:start",message:"commitVoiceTranscript invoked",data:{hasCallId:Boolean(callId?.trim()),fallbackLength:transcriptFallback.trim().length,messagesCount:messages.length,messagesRefCount:messagesRef.current.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (transcriptCommitInFlightRef.current) return;
    const resolvedCallId = callId?.trim() || null;
    const resolvedTranscript = transcriptFallback.trim();
    if (!resolvedCallId && !resolvedTranscript) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/9cd54503-81ee-4381-aec3-f5256557b6dc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({runId:"post-fix",hypothesisId:"H1-H3",location:"builder-chat.tsx:commitVoiceTranscript:emptyGuard",message:"empty callId and transcript fallback",data:{resolvedCallId:resolvedCallId,resolvedTranscriptLength:resolvedTranscript.length,messagesCount:messages.length,messagesRefCount:messagesRef.current.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      addMessage({
        role: "assistant",
        content: "Conversation ended, but I could not capture enough transcript data to save cards.",
      });
      return;
    }
    transcriptCommitInFlightRef.current = true;
    setLoading(true);
    try {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/9cd54503-81ee-4381-aec3-f5256557b6dc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({runId:"post-fix-2",hypothesisId:"H6-H8",location:"builder-chat.tsx:commitVoiceTranscript:apiRequest",message:"posting transcript commit request",data:{hasCallId:Boolean(resolvedCallId),resolvedTranscriptLength:resolvedTranscript.length,sessionId:sessionId ?? null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const res = await api<BuilderSessionCommitResponse>("/builder/transcript/commit", {
        method: "POST",
        body: {
          session_id: sessionId,
          mode: "voice",
          call_id: resolvedCallId,
          transcript: resolvedTranscript,
        },
      });
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/9cd54503-81ee-4381-aec3-f5256557b6dc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({runId:"post-fix-2",hypothesisId:"H6-H8",location:"builder-chat.tsx:commitVoiceTranscript:apiSuccess",message:"transcript commit response received",data:{committedCardCount:res.committed_card_count,sessionStatus:res.session_status},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (res.committed_card_count > 0) {
        addMessage({
          role: "assistant",
          content: `Saved ${res.committed_card_count} experience ${res.committed_card_count === 1 ? "card" : "cards"} from this conversation.`,
        });
      } else {
        addMessage({
          role: "assistant",
          content: "I could not extract a clear experience card from this conversation yet.",
        });
      }
      queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARDS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY });
      onCardsSaved?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error ?? "unknown");
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/9cd54503-81ee-4381-aec3-f5256557b6dc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({runId:"post-fix-2",hypothesisId:"H6-H8",location:"builder-chat.tsx:commitVoiceTranscript:apiError",message:"transcript commit request failed",data:{errorMessage,hasCallId:Boolean(resolvedCallId),resolvedTranscriptLength:resolvedTranscript.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      addMessage({
        role: "assistant",
        content: "Conversation ended, but saving cards failed. Please try again.",
      });
    } finally {
      setLoading(false);
      transcriptCommitInFlightRef.current = false;
    }
  }, [addMessage, onCardsSaved, queryClient, sessionId]);

  const detachVoice = useCallback((target?: VapiClient | null) => {
    if (!target || vapiRef.current === target) {
      vapiRef.current = null;
    }
    resetVoiceState();
  }, [resetVoiceState]);

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
    if (!isVapiVoiceConfigured()) {
      setVoiceError(
        "Voice is not configured. Set NEXT_PUBLIC_VAPI_PUBLIC_KEY and NEXT_PUBLIC_VAPI_ASSISTANT_ID in apps/web/.env.local (Vapi dashboard → API keys)."
      );
      setVoiceConnecting(false);
      return;
    }

    try {
      const publicKey = getVapiPublicKey();
      const assistantId = getVapiAssistantId();
      vapi = await createPatchedVapiClient(publicKey);
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
        setVoiceConnecting(false);
        setVoiceConnected(true);
        setVoiceError(null);
        const callId = getCurrentVapiCallId(vapi);
        if (callId) activeVapiCallIdRef.current = callId;
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/9cd54503-81ee-4381-aec3-f5256557b6dc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({runId:"pre-fix",hypothesisId:"H2",location:"builder-chat.tsx:vapi:call-start",message:"voice call started",data:{hasCallId:Boolean(callId),capturedMessagesAtStartVoice:messages.length},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
      });

      vapi.on("call-end", () => {
        const callId = activeVapiCallIdRef.current ?? getCurrentVapiCallId(vapi);
        const transcriptFallback = serializeTranscriptFromMessages(messagesRef.current);
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/9cd54503-81ee-4381-aec3-f5256557b6dc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({runId:"post-fix",hypothesisId:"H1-H3",location:"builder-chat.tsx:vapi:call-end",message:"call ended and commit requested",data:{hasCallId:Boolean(callId),fallbackLength:transcriptFallback.length,capturedMessagesInCallEndClosure:messages.length,messagesRefCount:messagesRef.current.length},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        void commitVoiceTranscript(callId, transcriptFallback);
        detachVoice(vapi);
        activeVapiCallIdRef.current = null;
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
        if (pendingAutoEndRef.current) {
          pendingAutoEndRef.current = false;
          stopVoice();
        }
      });

      vapi.on("message", (msg: unknown) => {
        const m = msg as Record<string, unknown>;
        const transcriptType = String(m.transcriptType ?? "").toLowerCase();
        const isPartial = Boolean(transcriptType && transcriptType !== "final");
        const text = extractTranscriptText(m);
        // Treat any non-"assistant" transcript as coming from the user so user speech
        // always appears on the right-hand side.
        const role: TranscriptRole = m.role === "assistant" ? "assistant" : "user";
        const eventCallId = extractVapiCallId(m);
        if (eventCallId) activeVapiCallIdRef.current = eventCallId;
        if (!text) {
          return;
        }
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/9cd54503-81ee-4381-aec3-f5256557b6dc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({runId:"pre-fix",hypothesisId:"H2-H5",location:"builder-chat.tsx:vapi:message",message:"transcript chunk received",data:{role,isPartial,textLength:text.length,hasEventCallId:Boolean(eventCallId),activeCallIdKnown:Boolean(activeVapiCallIdRef.current)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        // IMPORTANT: Do not mutate active bubble IDs on transcript-less/status events.
        // Those events are common mid-call and clearing them can make bubbles "disappear".
        if (role === "user") setUserSpeaking(true);
        if (role === "assistant" && isAssistantWrapUpTranscript(text)) {
          pendingAutoEndRef.current = true;
          if (autoEndTimeoutRef.current) {
            clearTimeout(autoEndTimeoutRef.current);
          }
          // Fallback if speech-end is not emitted.
          autoEndTimeoutRef.current = setTimeout(() => {
            if (!pendingAutoEndRef.current) return;
            pendingAutoEndRef.current = false;
            stopVoice();
          }, 2200);
        }

        // Transcripts can arrive as multiple events for both roles; update a single
        // bubble per spoken turn. Partial chunks "stream" by replacing content,
        // and final chunks append.
        setMessages((prev) =>
          role === "user"
            ? upsertStreamingTranscriptMessage(
                prev,
                "user",
                text,
                isPartial,
                activeUserMessageIdRef,
                committedUserTextRef
              )
            : upsertStreamingTranscriptMessage(
                prev,
                "assistant",
                text,
                isPartial,
                activeAssistantMessageIdRef,
                committedAssistantTextRef
              )
        );
      });

      vapi.on("error", (err) => {
        const errObj = err as Record<string, unknown>;
        const errType = String(errObj?.type ?? "").toLowerCase();
        const friendlyMsg = resolveVoiceErrorMessage(err);
        const meetingEnded = errType === "daily-error" && /meeting has ended/i.test(friendlyMsg);
        if (meetingEnded) {
          setVoiceError(null);
          // Don't detach immediately; allow any final assistant transcript chunks
          // to arrive. Cleanup will happen on `call-end`.
          return;
        }
        detachVoice(vapi);
        setVoiceError(friendlyMsg);
      });

      await vapi.start(assistantId);
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
  }, [commitVoiceTranscript, detachVoice, messages, stopVoice]);

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
    if (pathname !== "/builder") return;
    // Kick off preload and start voice immediately.
    // `startVoice()` will still wait for preload if needed, but the UI state
    // (e.g. "connecting") flips right away for a more "instant" feel.
    void preloadVapiWeb().catch(() => {});
    void startVoiceRef.current();
  }, [pathname]);

  // Enforce voice scope to /builder only: stop immediately when route changes.
  useEffect(() => {
    if (pathname === "/builder") return;
    if (vapiRef.current) {
      stopVoice();
    }
  }, [pathname, stopVoice]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = collapseAdjacentDuplicatePhrases(overrideText !== undefined ? overrideText : input);
    if (!text || loading) return;
    setInput("");
    addMessage({ role: "user", content: text });
    addMessage({
      role: "assistant",
      content: "Got it. Keep going — I'll create cards when the voice conversation ends.",
    });
  }, [
    input,
    loading,
    addMessage,
  ]);

  return (
    <div className="relative flex flex-col h-full min-h-0 rounded-xl border border-border bg-card overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 scrollbar-thin scrollbar-theme">
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
