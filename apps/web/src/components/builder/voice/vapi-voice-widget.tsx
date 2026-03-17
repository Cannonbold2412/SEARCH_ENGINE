"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2, PhoneOff, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/constants";
import { AUTH_TOKEN_KEY } from "@/lib/auth-flow";
import { EXPERIENCE_CARD_FAMILIES_QUERY_KEY } from "@/hooks";
import { createPatchedVapiClient, isBenignVapiDisconnectError, type VapiClient } from "@/lib/vapi-client";
import Link from "next/link";
import { cn } from "@/lib/utils";

type VoiceTranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

/** Vapi message event for transcript - can be lowercase or uppercase type */
function isTranscriptMessage(msg: unknown): msg is { type: string; role?: string; transcriptType?: string; transcript?: string } {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  const type = String(m.type ?? "").toLowerCase();
  return type === "transcript" && typeof (m.transcript ?? m.content) === "string";
}

export function VapiVoiceWidget() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<VoiceTranscriptMessage[]>([]);
  const vapiRef = useRef<VapiClient | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const activeUserMessageIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const getToken = () => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(AUTH_TOKEN_KEY);
  };

  const resetCallState = useCallback(() => {
    setConnecting(false);
    setIsConnected(false);
    setIsSpeaking(false);
    activeAssistantMessageIdRef.current = null;
    activeUserMessageIdRef.current = null;
  }, []);

  const detachCall = useCallback((target?: VapiClient | null) => {
    if (!target || vapiRef.current === target) {
      vapiRef.current = null;
    }
    resetCallState();
  }, [resetCallState]);

  const addTranscriptMessage = useCallback((role: "user" | "assistant", text: string) => {
    const t = (text ?? "").trim();
    if (!t) return;
    setMessages((prev) => {
      const mergeText = (oldText: string, nextText: string) => {
        const oldEndsWithSpace = /\s$/.test(oldText);
        const nextStartsWithSpace = /^\s/.test(nextText);
        if (oldText.length === 0) return nextText;
        if (oldEndsWithSpace || nextStartsWithSpace) return oldText + nextText;
        return oldText + " " + nextText;
      };

      if (role === "user") {
        const activeId = activeUserMessageIdRef.current;
        if (activeId) {
          return prev.map((m) =>
            m.id === activeId ? { ...m, content: mergeText(m.content, t) } : m
          );
        }
        const newId = `${Date.now()}-${prev.length}`;
        activeUserMessageIdRef.current = newId;
        return [...prev, { id: newId, role, content: t }];
      }

      const activeId = activeAssistantMessageIdRef.current;
      if (activeId) {
        return prev.map((m) =>
          m.id === activeId ? { ...m, content: mergeText(m.content, t) } : m
        );
      }
      const newId = `${Date.now()}-${prev.length}`;
      activeAssistantMessageIdRef.current = newId;
      return [...prev, { id: newId, role, content: t }];
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStart = useCallback(async () => {
    setError(null);
    setMessages([]);
    setConnecting(true);
    let vapi: VapiClient | null = null;
    const token = getToken();
    if (!token) {
      setError("Please sign in to use voice");
      setConnecting(false);
      return;
    }
    if (!API_BASE || !API_BASE.startsWith("http")) {
      setError("API not configured");
      setConnecting(false);
      return;
    }
    const proxyBase = `${API_BASE}/convai`;
    try {
      vapi = await createPatchedVapiClient(token, proxyBase);
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
        setError(null);
        setIsConnected(true);
        activeAssistantMessageIdRef.current = null;
        activeUserMessageIdRef.current = null;
      });

      vapi.on("call-end", () => {
        detachCall(vapi);
        queryClient.invalidateQueries({ queryKey: [EXPERIENCE_CARD_FAMILIES_QUERY_KEY] });
      });

      vapi.on("speech-start", () => setIsSpeaking(true));
      vapi.on("speech-end", () => setIsSpeaking(false));

      vapi.on("message", (msg: unknown) => {
        if (!isTranscriptMessage(msg)) return;
        const transcriptType = String(
          (msg as Record<string, unknown>).transcriptType ?? ""
        ).toLowerCase();
        const isPartial = transcriptType && transcriptType !== "final";
        const text = (msg.transcript ?? (msg as Record<string, unknown>).content) as string;
        const role =
          msg.role === "user" || msg.role === "assistant" ? msg.role : "assistant";

        const t = (text ?? "").trim();
        if (!t) return;

        setMessages((prev) => {
          const mergeText = (oldText: string, nextText: string) => {
            const oldEndsWithSpace = /\s$/.test(oldText);
            const nextStartsWithSpace = /^\s/.test(nextText);
            if (oldText.length === 0) return nextText;
            if (oldEndsWithSpace || nextStartsWithSpace) return oldText + nextText;
            return oldText + " " + nextText;
          };

          if (role === "user") {
            const activeId = activeUserMessageIdRef.current;
            if (activeId) {
              return prev.map((m) =>
                m.id === activeId
                  ? {
                      ...m,
                      content: isPartial ? t : mergeText(m.content, t),
                    }
                  : m
              );
            }
            const newId = `${Date.now()}-${prev.length}`;
            activeUserMessageIdRef.current = newId;
            return [...prev, { id: newId, role, content: t }];
          }

          const activeId = activeAssistantMessageIdRef.current;
          if (activeId) {
            return prev.map((m) =>
              m.id === activeId
                ? {
                    ...m,
                    content: isPartial ? t : mergeText(m.content, t),
                  }
                : m
            );
          }
          const newId = `${Date.now()}-${prev.length}`;
          activeAssistantMessageIdRef.current = newId;
          return [...prev, { id: newId, role, content: t }];
        });
      });

      vapi.on("error", (err) => {
        const errObj = err as Record<string, unknown>;
        const errType = String(errObj?.type ?? "").toLowerCase();
        const errMsg = (err?.message as string) || "";
        // start-method-error = our proxy returned 503 (e.g. local/callback mismatch)
        const isLocal = typeof window !== "undefined" && /localhost|127\.0\.0\.1/.test(API_BASE);
        const friendlyMsg =
          errType === "start-method-error" && isLocal
            ? "Voice needs a tunnel. 1) Run ngrok (e.g. .\\scripts\\ngrok-tunnel.ps1 or ngrok http 8000). 2) In apps/api/.env set VAPI_CALLBACK_BASE_URL to the https URL ngrok shows. 3) Restart the API."
            : errMsg || "Voice connection error";
        if (errType === "daily-error" && /meeting has ended/i.test(friendlyMsg)) {
          setError(null);
          detachCall(vapi);
          return;
        }
        detachCall(vapi);
        setError(friendlyMsg);
      });

      await vapi.start({}); // Assistant config comes from our backend proxy
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start voice session";
      const isExpectedDisconnect = isBenignVapiDisconnectError(e);
      detachCall(vapi);
      if (isExpectedDisconnect) {
        setError(null);
        return;
      }
      setError(msg);
    } finally {
      setConnecting(false);
    }
  }, [detachCall, queryClient, addTranscriptMessage]);

  const handleEnd = useCallback(async () => {
    const vapi = vapiRef.current;
    detachCall(vapi);
    if (!vapi) return;
    void vapi.stop().catch((error) => {
      if (!isBenignVapiDisconnectError(error)) {
        setError("Could not end session");
      }
    });
  }, [detachCall]);

  useEffect(() => {
    return () => {
      if (vapiRef.current) {
        handleEnd();
      }
    };
  }, [handleEnd]);

  return (
    <div className="flex flex-col h-full min-h-0 rounded-xl border border-border bg-card overflow-hidden">
      {/* Transcript area - same layout as Type mode */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {!isConnected && messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Use real-time voice to add an experience. Speak naturally—the AI will ask follow-up questions
            and build your card. Your cards will appear when you&apos;re done.
          </p>
        )}
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
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={scrollRef} />
      </div>

      {/* Footer - voice controls */}
      <div className="flex flex-col gap-2 p-3 border-t border-border flex-shrink-0">
        {error && (
          <p className="text-sm text-destructive text-center" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          {!isConnected ? (
            <Button
              onClick={handleStart}
              disabled={connecting}
              size="lg"
              className="gap-2 flex-1"
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  Start voice
                </>
              )}
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {isSpeaking ? (
                  <Volume2 className="h-4 w-4 animate-pulse text-primary" />
                ) : (
                  <MicOff className="h-4 w-4" />
                )}
                <span>{isSpeaking ? "Listening…" : "Connected"}</span>
              </div>
              <Button
                variant="outline"
                onClick={handleEnd}
                size="lg"
                className="gap-2"
              >
                <PhoneOff className="h-4 w-4" />
                End session
              </Button>
              {isConnected && (
                <Link
                  href="/cards"
                  className="text-sm text-primary hover:underline shrink-0"
                >
                  View cards →
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
