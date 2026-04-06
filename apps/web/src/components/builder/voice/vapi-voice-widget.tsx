"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2, PhoneOff, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTH_TOKEN_KEY } from "@/lib/auth-flow";
import { getVapiAssistantId, getVapiPublicKey, isVapiVoiceConfigured } from "@/lib/vapi-config";
import {
  createPatchedVapiClient,
  isBenignVapiDisconnectError,
  stopVapiClient,
  type VapiClient,
} from "@/lib/vapi-client";
import { isTranscriptPartial, mergePartialTranscriptChunk } from "@/lib/vapi-transcript";
import { useLanguage } from "@/contexts/language-context";
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
  const { language } = useLanguage();
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
    if (!isVapiVoiceConfigured(language)) {
      setError(
        "Set NEXT_PUBLIC_VAPI_PUBLIC_KEY and NEXT_PUBLIC_VAPI_ASSISTANT_ID (Vapi dashboard)."
      );
      setConnecting(false);
      return;
    }

    try {
      const publicKey = getVapiPublicKey();
      const assistantId = getVapiAssistantId(language);
      vapi = await createPatchedVapiClient(publicKey);
      const client = vapi;
      vapiRef.current = client;

      client.on("call-start", () => {
        setError(null);
        setIsConnected(true);
        activeAssistantMessageIdRef.current = null;
        activeUserMessageIdRef.current = null;
      });

      client.on("call-end", () => {
        void stopVapiClient(client).finally(() => detachCall(client));
      });

      client.on("speech-start", () => setIsSpeaking(true));
      client.on("speech-end", () => setIsSpeaking(false));

      client.on("message", (msg: unknown) => {
        if (!isTranscriptMessage(msg)) return;
        const mrec = msg as Record<string, unknown>;
        const isPartial = isTranscriptPartial(mrec);
        const text = (msg.transcript ?? mrec.content) as string;
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
                      content: isPartial ? mergePartialTranscriptChunk(m.content, t) : mergeText(m.content, t),
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
                    content: isPartial ? mergePartialTranscriptChunk(m.content, t) : mergeText(m.content, t),
                  }
                : m
            );
          }
          const newId = `${Date.now()}-${prev.length}`;
          activeAssistantMessageIdRef.current = newId;
          return [...prev, { id: newId, role, content: t }];
        });
      });

      client.on("error", (err) => {
        const errObj = err as Record<string, unknown>;
        const errType = String(errObj?.type ?? "").toLowerCase();
        const errMsg = (err?.message as string) || "";
        if (errType === "daily-error" && /meeting has ended/i.test(errMsg)) {
          setError(null);
          void stopVapiClient(client).finally(() => detachCall(client));
          return;
        }
        void stopVapiClient(client).finally(() => {
          detachCall(client);
          setError(errMsg || "Voice connection error");
        });
      });

      await client.start(assistantId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start voice session";
      const isExpectedDisconnect = isBenignVapiDisconnectError(e);
      if (vapi) {
        void stopVapiClient(vapi).finally(() => detachCall(vapi));
      } else {
        detachCall(vapi);
      }
      if (isExpectedDisconnect) {
        setError(null);
        return;
      }
      setError(msg);
    } finally {
      setConnecting(false);
    }
  }, [detachCall, language]);

  const handleEnd = useCallback(async () => {
    const vapi = vapiRef.current;
    if (!vapi) return;
    await stopVapiClient(vapi);
    detachCall(vapi);
  }, [detachCall]);

  useEffect(() => {
    return () => {
      const vapi = vapiRef.current;
      if (!vapi) return;
      void stopVapiClient(vapi).finally(() => {
        detachCall(vapi);
      });
    };
  }, [detachCall]);

  return (
    <div className="flex flex-col h-full min-h-0 rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {!isConnected && messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Real-time voice uses your Vapi dashboard assistant. Configure{" "}
            <code className="text-xs">NEXT_PUBLIC_VAPI_PUBLIC_KEY</code> and{" "}
            <code className="text-xs">NEXT_PUBLIC_VAPI_ASSISTANT_ID</code>.
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

      <div className="flex flex-col gap-2 p-3 border-t border-border/60 flex-shrink-0">
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
