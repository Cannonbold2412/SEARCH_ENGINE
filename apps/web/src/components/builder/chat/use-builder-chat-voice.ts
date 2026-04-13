"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { EXPERIENCE_CARD_FAMILIES_QUERY_KEY } from "@/hooks";
import { AUTH_TOKEN_KEY } from "@/lib/auth-flow";
import { api } from "@/lib/api";
import { isVapiVoiceConfigured, getVapiAssistantId, getVapiPublicKey } from "@/lib/vapi-config";
import {
  claimEagerPrewarm,
  createPatchedVapiClient,
  discardEagerPrewarm,
  isBenignVapiDisconnectError,
  preloadVapiWeb,
  stopVapiClient,
  type VapiClient,
} from "@/lib/vapi-client";
import {
  extractTranscriptText,
  isTranscriptPartial,
  upsertStreamingTranscriptMessage,
} from "@/lib/vapi-transcript";
import type { SavedCardFamily } from "@/lib/types";
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
  const [sttMuted, setSttMuted] = useState(false);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const committedAssistantTextRef = useRef("");
  const activeUserMessageIdRef = useRef<string | null>(null);
  const committedUserTextRef = useRef("");
  const transcriptCommitInFlightRef = useRef(false);
  const activeVapiCallIdRef = useRef<string | null>(null);
  const callStartMessageCountRef = useRef(0);
  const voiceStartInFlightRef = useRef(false);

  const resetVoiceState = useCallback(() => {
    setVoiceConnecting(false);
    setVoiceConnected(false);
    setAiSpeaking(false);
    setUserSpeaking(false);
    setSttMuted(false);
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
        // Optimistically inject the new card family into the cache so it shows
        // up on /cards immediately without waiting for the refetch round-trip.
        if (res.cards?.length) {
          const newFamily: SavedCardFamily = {
            parent: res.cards[0],
            children: res.children ?? [],
          };
          queryClient.setQueryData<SavedCardFamily[]>(
            EXPERIENCE_CARD_FAMILIES_QUERY_KEY,
            (prev) => (prev ? [newFamily, ...prev] : [newFamily]),
          );
        }
      } else {
        setCommitStatus("error");
        addMessage({
          role: "assistant",
          content: "I could not extract a clear experience card from this conversation yet.",
        });
      }
      // Trigger background refetch to reconcile any server-side differences.
      queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY });
      onCardsSaved?.();
    } catch (error) {
      setCommitStatus("error");
      const serverMsg = error instanceof Error ? error.message : "";
      const isInsufficientInput = serverMsg.length > 20 && !serverMsg.includes("unavailable");
      addMessage({
        role: "assistant",
        content: isInsufficientInput
          ? serverMsg
          : "Conversation ended, but saving cards failed. Please try again.",
      });
    } finally {
      setLoading(false);
      transcriptCommitInFlightRef.current = false;
    }
  }, [addMessage, messagesRef, onCardsSaved, queryClient, sessionId, setCommitStatus, setLoading, language]);

  const stopVoice = useCallback(() => {
    const vapi = vapiRef.current;
    if (!vapi) return;
    void stopVapiClient(vapi).finally(() => {
      detachVoice(vapi);
    });
  }, [detachVoice]);

  const attachFullHandlers = useCallback((client: VapiClient) => {
    client.on("call-start", () => {
      setVoiceConnecting(false);
      setVoiceConnected(true);
      setVoiceError(null);
      setCommitStatus("idle");
      const callId = getCurrentVapiCallId(client);
      if (callId) activeVapiCallIdRef.current = callId;
      callStartMessageCountRef.current = messagesRef.current.length;
    });

    client.on("call-end", () => {
      const callId = activeVapiCallIdRef.current ?? getCurrentVapiCallId(client);
      const transcriptStartIndex = Math.max(0, callStartMessageCountRef.current);
      const transcriptMessages = messagesRef.current.slice(transcriptStartIndex);
      const transcriptFallback = serializeTranscriptFromMessages(transcriptMessages);
      void commitVoiceTranscript(callId, transcriptFallback);
      void stopVapiClient(client).finally(() => {
        detachVoice(client);
        activeVapiCallIdRef.current = null;
        callStartMessageCountRef.current = 0;
      });
    });

    client.on("speech-start", () => {
      setAiSpeaking(true);
      activeAssistantMessageIdRef.current = null;
      committedAssistantTextRef.current = "";
      activeUserMessageIdRef.current = null;
      committedUserTextRef.current = "";
      setUserSpeaking(false);
    });
    client.on("speech-end", () => {
      setAiSpeaking(false);
      activeAssistantMessageIdRef.current = null;
      committedAssistantTextRef.current = "";
    });

    client.on("message", (msg: unknown) => {
      const m = msg as Record<string, unknown>;
      const isPartial = isTranscriptPartial(m);
      const text = extractTranscriptText(m);
      const role: TranscriptRole = m.role === "assistant" ? "assistant" : "user";
      const eventCallId = extractVapiCallId(m);
      if (eventCallId) activeVapiCallIdRef.current = eventCallId;
      if (!text) return;
      if (role === "user") setUserSpeaking(true);

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

    client.on("error", (err) => {
      const errObj = err as Record<string, unknown>;
      const errType = String(errObj?.type ?? "").toLowerCase();
      const friendlyMsg = resolveVoiceErrorMessage(err);
      const meetingEnded = errType === "daily-error" && /meeting has ended/i.test(friendlyMsg);
      if (meetingEnded) {
        setVoiceError(null);
        const callId = activeVapiCallIdRef.current ?? getCurrentVapiCallId(client);
        const transcriptStartIndex = Math.max(0, callStartMessageCountRef.current);
        const transcriptMessages = messagesRef.current.slice(transcriptStartIndex);
        const transcriptFallback = serializeTranscriptFromMessages(transcriptMessages);
        void commitVoiceTranscript(callId, transcriptFallback);
        void stopVapiClient(client).finally(() => {
          detachVoice(client);
          activeVapiCallIdRef.current = null;
          callStartMessageCountRef.current = 0;
        });
        return;
      }
      void stopVapiClient(client).finally(() => {
        detachVoice(client);
        setVoiceError(friendlyMsg);
      });
    });
  }, [commitVoiceTranscript, detachVoice, messagesRef, setMessages, setCommitStatus]);

  const startVoice = useCallback(async () => {
    if (vapiRef.current || voiceStartInFlightRef.current) return;
    voiceStartInFlightRef.current = true;
    setVoiceError(null);
    setVoiceConnecting(true);
    let vapi: VapiClient | null = null;

    const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) {
      setVoiceError("Please sign in to use voice");
      setVoiceConnecting(false);
      voiceStartInFlightRef.current = false;
      return;
    }
    if (!isVapiVoiceConfigured(language)) {
      setVoiceError(
        "Voice is not configured. Set NEXT_PUBLIC_VAPI_PUBLIC_KEY and NEXT_PUBLIC_VAPI_ASSISTANT_ID in apps/web/.env.local (Vapi dashboard -> API keys)."
      );
      setVoiceConnecting(false);
      voiceStartInFlightRef.current = false;
      return;
    }

    try {
      // 1. Try the module-level eager prewarm (started from nav click)
      const eager = await claimEagerPrewarm();
      if (eager) {
        vapi = eager.client;
        vapiRef.current = vapi;
        eager.client.removeAllListeners("call-start");
        eager.client.removeAllListeners("error");
        attachFullHandlers(vapi);
        if (eager.callStartFired) {
          setVoiceConnecting(false);
          setVoiceConnected(true);
          setVoiceError(null);
          setCommitStatus("idle");
          const callId = getCurrentVapiCallId(vapi);
          if (callId) activeVapiCallIdRef.current = callId;
          callStartMessageCountRef.current = messagesRef.current.length;
        }
        voiceStartInFlightRef.current = false;
        return;
      }

      // 2. Cold start — no prewarm available
      const publicKey = getVapiPublicKey();
      const assistantId = getVapiAssistantId(language);
      vapi = await createPatchedVapiClient(publicKey);
      vapiRef.current = vapi;
      attachFullHandlers(vapi);
      await vapi.start(assistantId);
    } catch (e) {
      const isExpectedDisconnect = isBenignVapiDisconnectError(e);
      if (isExpectedDisconnect) {
        setVoiceError(null);
        if (vapi) {
          void stopVapiClient(vapi).finally(() => detachVoice(vapi));
        }
        return;
      }
      if (vapi) {
        void stopVapiClient(vapi).finally(() => detachVoice(vapi));
      }
      setVoiceError(e instanceof Error ? e.message : "Could not start voice session");
    } finally {
      voiceStartInFlightRef.current = false;
    }
  }, [
    attachFullHandlers,
    detachVoice,
    messagesRef,
    setCommitStatus,
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

  const toggleStt = useCallback(() => {
    const client = vapiRef.current;
    if (!client) return;
    const nowMuted = !sttMuted;
    client.setMuted(nowMuted);
    setSttMuted(nowMuted);
  }, [sttMuted]);

  const sendTextToAssistant = useCallback((text: string) => {
    const client = vapiRef.current;
    if (!client || !text.trim()) return false;
    client.send({ type: "add-message", message: { role: "user", content: text.trim() } });
    return true;
  }, []);

  useEffect(() => {
    if (!sttMuted) return;
    setAiSpeaking(false);
    setUserSpeaking(false);
  }, [sttMuted]);

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
    discardEagerPrewarm();
  }, [pathname, stopVoice]);

  return {
    voiceConnecting,
    voiceConnected,
    voiceError,
    sttMuted,
    sphereActive: voiceConnecting
      ? ("connecting" as const)
      : sttMuted
        ? ("idle" as const)
        : aiSpeaking
          ? ("ai" as const)
          : userSpeaking || voiceConnected
            ? ("user" as const)
            : ("idle" as const),
    sphereIntensity: sttMuted ? 0 : aiSpeaking ? 0.85 : userSpeaking ? 0.7 : voiceConnected ? 0.25 : 0,
    toggleVoice,
    toggleStt,
    sendTextToAssistant,
  };
}
