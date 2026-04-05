"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { EXPERIENCE_CARD_FAMILIES_QUERY_KEY, EXPERIENCE_CARDS_QUERY_KEY } from "@/hooks";
import { AUTH_TOKEN_KEY } from "@/lib/auth-flow";
import { api } from "@/lib/api";
import { isVapiVoiceConfigured, getVapiAssistantId, getVapiPublicKey } from "@/lib/vapi-config";
import { createPatchedVapiClient, isBenignVapiDisconnectError, preloadVapiWeb, type VapiClient } from "@/lib/vapi-client";
import {
  extractTranscriptText,
  isTranscriptPartial,
  upsertStreamingTranscriptMessage,
} from "@/lib/vapi-transcript";
import type { BuilderSessionCommitResponse, ChatMessage } from "./builder-chat-types";

type TranscriptRole = "assistant" | "user";

type UseBuilderChatVoiceArgs = {
  pathname: string;
  queryClient: QueryClient;
  sessionId: string | null;
  messagesRef: MutableRefObject<ChatMessage[]>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setCommitStatus: Dispatch<SetStateAction<"idle" | "saving" | "success" | "error">>;
  onCardsSaved?: () => void;
  /** Preferred language code for voice assistant (defaults to "en") */
  language?: string;
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

export function useBuilderChatVoice({
  pathname,
  queryClient,
  sessionId,
  messagesRef,
  setMessages,
  setLoading,
  setCommitStatus,
  onCardsSaved,
  language = "en",
}: UseBuilderChatVoiceArgs) {
  const vapiRef = useRef<VapiClient | null>(null);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(true);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const committedAssistantTextRef = useRef("");
  const activeUserMessageIdRef = useRef<string | null>(null);
  const committedUserTextRef = useRef("");
  const pendingAutoEndRef = useRef(false);
  const autoEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptCommitInFlightRef = useRef(false);
  const activeVapiCallIdRef = useRef<string | null>(null);
  const callStartMessageCountRef = useRef(0);

  const resetVoiceState = useCallback(() => {
    setVoiceConnecting(false);
    setVoiceConnected(false);
    setAiSpeaking(false);
    setUserSpeaking(false);
    pendingAutoEndRef.current = false;
    if (autoEndTimeoutRef.current) {
      clearTimeout(autoEndTimeoutRef.current);
      autoEndTimeoutRef.current = null;
    }
    activeVapiCallIdRef.current = null;
    callStartMessageCountRef.current = 0;
  }, []);

  const addMessage = useCallback((msg: Omit<ChatMessage, "id">) => {
    setMessages((prev) => [...prev, { ...msg, id: String(prev.length + Date.now()) }]);
  }, [setMessages]);

  const detachVoice = useCallback((target?: VapiClient | null) => {
    if (!target || vapiRef.current === target) {
      vapiRef.current = null;
    }
    resetVoiceState();
  }, [resetVoiceState]);

  const commitVoiceTranscript = useCallback(async (callId: string | null, transcriptFallback: string) => {
    if (transcriptCommitInFlightRef.current) return;
    const resolvedCallId = callId?.trim() || null;
    const resolvedTranscript = transcriptFallback.trim();
    if (!resolvedCallId && !resolvedTranscript) {
      addMessage({
        role: "assistant",
        content: "Conversation ended, but I could not capture enough transcript data to save cards.",
      });
      return;
    }
    transcriptCommitInFlightRef.current = true;
    setLoading(true);
    setCommitStatus("saving");
    try {
      const res = await api<BuilderSessionCommitResponse>("/builder/transcript/commit", {
        method: "POST",
        body: {
          session_id: sessionId,
          mode: "voice",
          call_id: resolvedCallId,
          transcript: resolvedTranscript,
          language: language,
        },
      });
      if (res.committed_card_count > 0) {
        setCommitStatus("success");
      } else {
        setCommitStatus("error");
        addMessage({
          role: "assistant",
          content: "I could not extract a clear experience card from this conversation yet.",
        });
      }
      queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARDS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY });
      onCardsSaved?.();
    } catch (error) {
      setCommitStatus("error");
      addMessage({
        role: "assistant",
        content: "Conversation ended, but saving cards failed. Please try again.",
      });
    } finally {
      setLoading(false);
      transcriptCommitInFlightRef.current = false;
    }
  }, [addMessage, messagesRef, onCardsSaved, queryClient, sessionId, setCommitStatus, setLoading, language]);

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
    if (!isVapiVoiceConfigured(language)) {
      setVoiceError(
        "Voice is not configured. Set NEXT_PUBLIC_VAPI_PUBLIC_KEY and NEXT_PUBLIC_VAPI_ASSISTANT_ID in apps/web/.env.local (Vapi dashboard -> API keys)."
      );
      setVoiceConnecting(false);
      return;
    }

    try {
      const publicKey = getVapiPublicKey();
      const assistantId = getVapiAssistantId(language);
      vapi = await createPatchedVapiClient(publicKey);
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
        setVoiceConnecting(false);
        setVoiceConnected(true);
        setVoiceError(null);
        setCommitStatus("idle");
        const callId = getCurrentVapiCallId(vapi);
        if (callId) activeVapiCallIdRef.current = callId;
        callStartMessageCountRef.current = messagesRef.current.length;
      });

      vapi.on("call-end", () => {
        const callId = activeVapiCallIdRef.current ?? getCurrentVapiCallId(vapi);
        const transcriptStartIndex = Math.max(0, callStartMessageCountRef.current);
        const transcriptMessages = messagesRef.current.slice(transcriptStartIndex);
        const transcriptFallback = serializeTranscriptFromMessages(transcriptMessages);
        void commitVoiceTranscript(callId, transcriptFallback);
        detachVoice(vapi);
        activeVapiCallIdRef.current = null;
        callStartMessageCountRef.current = 0;
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
        const isPartial = isTranscriptPartial(m);
        const text = extractTranscriptText(m);
        const role: TranscriptRole = m.role === "assistant" ? "assistant" : "user";
        const eventCallId = extractVapiCallId(m);
        if (eventCallId) activeVapiCallIdRef.current = eventCallId;
        if (!text) {
          return;
        }
        if (role === "user") setUserSpeaking(true);
        if (role === "assistant" && isAssistantWrapUpTranscript(text)) {
          pendingAutoEndRef.current = true;
          if (autoEndTimeoutRef.current) {
            clearTimeout(autoEndTimeoutRef.current);
          }
          autoEndTimeoutRef.current = setTimeout(() => {
            if (!pendingAutoEndRef.current) return;
            pendingAutoEndRef.current = false;
            stopVoice();
          }, 2200);
        }

        setMessages((prev) =>
          role === "user"
            ? upsertStreamingTranscriptMessage(prev, "user", text, isPartial, activeUserMessageIdRef, committedUserTextRef)
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
  }, [
    commitVoiceTranscript,
    detachVoice,
    messagesRef,
    setMessages,
    setCommitStatus,
    setVoiceError,
    setVoiceConnecting,
    setVoiceConnected,
    setAiSpeaking,
    setUserSpeaking,
    stopVoice,
    language,
  ]);

  const startVoiceRef = useRef(startVoice);
  const stopVoiceRef = useRef(stopVoice);

  useEffect(() => {
    startVoiceRef.current = startVoice;
  }, [startVoice]);

  useEffect(() => {
    stopVoiceRef.current = stopVoice;
  }, [stopVoice]);

  /** BuilderChat unmounts on leave without a pathname re-render — always tear down Vapi here. */
  useEffect(() => {
    return () => {
      stopVoiceRef.current();
    };
  }, []);

  const toggleVoice = useCallback(async () => {
    if (voiceConnected && vapiRef.current) {
      stopVoice();
      return;
    }
    await startVoice();
  }, [startVoice, stopVoice, voiceConnected]);

  useEffect(() => {
    if (pathname !== "/builder") return;
    void preloadVapiWeb().catch(() => {});
    void startVoiceRef.current();
  }, [pathname]);

  useEffect(() => {
    if (pathname === "/builder") return;
    if (vapiRef.current) {
      stopVoice();
    }
  }, [pathname, stopVoice]);

  return {
    voiceConnecting,
    voiceConnected,
    voiceError,
    sphereActive: voiceConnecting
      ? ("connecting" as const)
      : aiSpeaking
        ? ("ai" as const)
        : userSpeaking || voiceConnected
          ? ("user" as const)
          : ("idle" as const),
    sphereIntensity: aiSpeaking ? 0.85 : userSpeaking ? 0.7 : voiceConnected ? 0.25 : 0,
    toggleVoice,
  };
}
