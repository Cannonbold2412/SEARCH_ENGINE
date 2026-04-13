"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CardDraftPatch } from "@/lib/apply-card-draft-patch";
import { extractUpdateCardDraftPatch } from "@/lib/vapi-card-draft-messages";
import { extractTranscriptText, isTranscriptPartial } from "@/lib/vapi-transcript";
import {
  createPatchedVapiClient,
  getVapiErrorMessage,
  isBenignVapiClientError,
  isBenignVapiDisconnectError,
  preloadVapiWeb,
  stopVapiClient,
  type VapiClient,
} from "@/lib/vapi-client";
import {
  getVapiEditAssistantId,
  getVapiPublicKey,
  isVapiEditVoiceConfigured,
} from "@/lib/vapi-config";
import { AUTH_TOKEN_KEY } from "@/lib/auth-flow";

export type VoiceTranscriptChunk = {
  role: "assistant" | "user";
  text: string;
  isPartial: boolean;
};

type UseEnhanceVapiVoiceOptions = {
  enabled: boolean;
  voiceSessionKey?: string;
  language?: string;
  variableValues: Record<string, string>;
  onDraftPatch: (patch: CardDraftPatch) => void;
  onTranscriptChunk?: (chunk: VoiceTranscriptChunk) => void;
  onTranscriptStreamReset?: () => void;
};

export function useEnhanceVapiVoice({
  enabled,
  voiceSessionKey,
  language = "en",
  variableValues,
  onDraftPatch,
  onTranscriptChunk,
  onTranscriptStreamReset,
}: UseEnhanceVapiVoiceOptions) {
  const vapiRef = useRef<VapiClient | null>(null);
  const prewarmedVapiRef = useRef<VapiClient | null>(null);
  const prewarmPromiseRef = useRef<Promise<void> | null>(null);
  const variableValuesRef = useRef(variableValues);
  const onDraftPatchRef = useRef(onDraftPatch);
  const onTranscriptChunkRef = useRef(onTranscriptChunk);
  const onTranscriptStreamResetRef = useRef(onTranscriptStreamReset);
  const callHasStartedRef = useRef(false);
  const delayedErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceStartInFlightRef = useRef(false);

  const clearDelayedErrorTimeout = useCallback(() => {
    if (delayedErrorTimeoutRef.current) {
      clearTimeout(delayedErrorTimeoutRef.current);
      delayedErrorTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => { variableValuesRef.current = variableValues; }, [variableValues]);

  const [connecting, setConnecting] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [sttMuted, setSttMuted] = useState(false);

  useEffect(() => { onDraftPatchRef.current = onDraftPatch; }, [onDraftPatch]);
  useEffect(() => { onTranscriptChunkRef.current = onTranscriptChunk; }, [onTranscriptChunk]);
  useEffect(() => { onTranscriptStreamResetRef.current = onTranscriptStreamReset; }, [onTranscriptStreamReset]);

  const detach = useCallback((target?: VapiClient | null) => {
    if (!target || vapiRef.current === target) {
      vapiRef.current = null;
    }
    setActive(false);
    setConnecting(false);
    setAiSpeaking(false);
    setUserSpeaking(false);
    setSttMuted(false);
    callHasStartedRef.current = false;
  }, []);

  const stop = useCallback(async () => {
    clearDelayedErrorTimeout();
    const vapi = vapiRef.current;
    if (!vapi) return;
    await stopVapiClient(vapi);
    detach(vapi);
    setError(null);
  }, [detach, clearDelayedErrorTimeout]);

  const prewarmVoiceClient = useCallback(() => {
    if (vapiRef.current || prewarmedVapiRef.current || prewarmPromiseRef.current) return;
    const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) return;
    if (!isVapiEditVoiceConfigured(language)) return;
    const publicKey = getVapiPublicKey();
    const assistantId = getVapiEditAssistantId(language);
    // Resolve `prewarmPromiseRef` as soon as the client exists and start() is *scheduled*
    // — do NOT await client.start() here. Awaiting the full Vapi/WebRTC handshake blocks
    // `start()` for the entire connect duration, defeating the overlap with page load.
    const task = createPatchedVapiClient(publicKey)
      .then((client) => {
        if (vapiRef.current || prewarmedVapiRef.current) {
          void stopVapiClient(client);
          return;
        }
        prewarmedVapiRef.current = client;
        (prewarmedVapiRef.current as unknown as Record<string, unknown>).__callStartFired = false;
        (prewarmedVapiRef.current as unknown as Record<string, unknown>).__prewarmError = null;
        client.on("call-start", () => {
          (client as unknown as Record<string, unknown>).__callStartFired = true;
        });
        client.on("error", (err: unknown) => {
          if (isBenignVapiDisconnectError(err)) return;
          const msg = getVapiErrorMessage(err);
          (client as unknown as Record<string, unknown>).__prewarmError = msg || "Voice connection error";
          if (prewarmedVapiRef.current === client) {
            prewarmedVapiRef.current = null;
          }
          void stopVapiClient(client);
        });
        void client.start(assistantId, { variableValues: variableValuesRef.current }).catch((e: unknown) => {
          if (isBenignVapiDisconnectError(e)) return;
          (client as unknown as Record<string, unknown>).__prewarmError = getVapiErrorMessage(e) || "Voice connection error";
          if (prewarmedVapiRef.current === client) prewarmedVapiRef.current = null;
          void stopVapiClient(client);
        });
      })
      .catch(() => {})
      .finally(() => { prewarmPromiseRef.current = null; });
    prewarmPromiseRef.current = task;
  }, [language]);

  const start = useCallback(async () => {
    if (vapiRef.current || voiceStartInFlightRef.current) return;
    voiceStartInFlightRef.current = true;
    if (!isVapiEditVoiceConfigured(language)) {
      setError(
        "Voice is not configured. Set NEXT_PUBLIC_VAPI_PUBLIC_KEY and NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID in apps/web/.env.local."
      );
      voiceStartInFlightRef.current = false;
      return;
    }
    const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) {
      setError("Please sign in to use voice");
      voiceStartInFlightRef.current = false;
      return;
    }
    const publicKey = getVapiPublicKey();
    const assistantId = getVapiEditAssistantId(language);
    setError(null);
    setConnecting(true);
    callHasStartedRef.current = false;
    clearDelayedErrorTimeout();
    let vapi: VapiClient | null = null;
    try {
      if (!prewarmedVapiRef.current && prewarmPromiseRef.current) {
        await prewarmPromiseRef.current;
      }
      const isPrewarmed = !!prewarmedVapiRef.current;
      if (prewarmedVapiRef.current) {
        vapi = prewarmedVapiRef.current;
        prewarmedVapiRef.current = null;
      } else {
        vapi = await createPatchedVapiClient(publicKey);
      }
      const client = vapi;
      // Remove any prewarm-only listeners before attaching full handlers
      client.removeAllListeners("call-start");
      client.removeAllListeners("error");
      vapiRef.current = client;

      client.on("call-start", () => {
        callHasStartedRef.current = true;
        clearDelayedErrorTimeout();
        setError(null);
        setActive(true);
        setConnecting(false);
        setAiSpeaking(true);
        setUserSpeaking(false);
      });

      client.on("call-end", () => {
        onTranscriptStreamResetRef.current?.();
        void stopVapiClient(client).finally(() => {
          detach(client);
        });
      });

      client.on("speech-start", () => {
        onTranscriptStreamResetRef.current?.();
        setAiSpeaking(true);
        setUserSpeaking(false);
      });

      client.on("speech-end", () => {
        setAiSpeaking(false);
      });

      client.on("message", (msg: unknown) => {
        const patch = extractUpdateCardDraftPatch(msg);
        if (patch) {
          onDraftPatchRef.current(patch);
          return;
        }

        const m = msg as Record<string, unknown>;
        const text = extractTranscriptText(m);
        if (!text) return;

        const isPartial = isTranscriptPartial(m);
        const role = m.role === "assistant" ? "assistant" : "user";

        onTranscriptChunkRef.current?.({ role, text, isPartial });

        if (role === "user") {
          setUserSpeaking(true);
          setAiSpeaking(false);
        }
      });

      client.on("error", (err: unknown) => {
        if (vapiRef.current !== client) return;
        if (isBenignVapiClientError(err)) {
          void stopVapiClient(client).finally(() => {
            detach(client);
            setError(null);
          });
          return;
        }
        const raw = getVapiErrorMessage(err).trim();
        const friendlyMsg = raw || "Voice connection error";
        const isGenericSdkLabel = /^(voice error|error)$/i.test(friendlyMsg);

        if (callHasStartedRef.current && isGenericSdkLabel) return;

        const isGenericPreCallNoise = !callHasStartedRef.current && isGenericSdkLabel;
        if (isGenericPreCallNoise) {
          clearDelayedErrorTimeout();
          delayedErrorTimeoutRef.current = setTimeout(() => {
            delayedErrorTimeoutRef.current = null;
            if (callHasStartedRef.current) return;
            if (vapiRef.current !== client) return;
            void (async () => {
              await stopVapiClient(client);
              detach(client);
              setError(friendlyMsg);
            })();
          }, 550);
          return;
        }

        const errObj = err as Record<string, unknown>;
        const errType = String(errObj?.type ?? "").toLowerCase();
        const meetingEnded = errType === "daily-error" && /meeting has ended/i.test(friendlyMsg);
        if (meetingEnded) {
          setError(null);
          void stopVapiClient(client).finally(() => detach(client));
          return;
        }

        void (async () => {
          await stopVapiClient(client);
          detach(client);
          setError(friendlyMsg);
        })();
      });

      if (isPrewarmed) {
        // Prewarm already called client.start() — check if call-start already fired
        const meta = client as unknown as Record<string, unknown>;
        if (meta.__callStartFired) {
          // call-start already happened before we attached our handler — fire it manually
          callHasStartedRef.current = true;
          clearDelayedErrorTimeout();
          setError(null);
          setActive(true);
          setConnecting(false);
          setAiSpeaking(true);
          setUserSpeaking(false);
        } else if (meta.__prewarmError) {
          throw new Error(String(meta.__prewarmError));
        }
        // else: connecting still in flight — our "call-start" listener will fire shortly
      } else {
        await client.start(assistantId, { variableValues: variableValuesRef.current });
      }
    } catch (e) {
      if (vapi) {
        await stopVapiClient(vapi).catch(() => {});
      }
      detach(vapi);
      clearDelayedErrorTimeout();
      if (!isBenignVapiDisconnectError(e)) {
        setError(e instanceof Error ? e.message : "Could not start voice");
      }
    } finally {
      voiceStartInFlightRef.current = false;
    }
  }, [language, detach, clearDelayedErrorTimeout, prewarmVoiceClient]);

  const toggle = useCallback(async () => {
    if (active || vapiRef.current) {
      await stop();
      return;
    }
    await start();
  }, [active, start, stop]);

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

  // Auto-start when enabled
  const startRef = useRef(start);
  useEffect(() => { startRef.current = start; }, [start]);

  useEffect(() => {
    if (!enabled) return;
    void preloadVapiWeb().catch(() => {});
    prewarmVoiceClient();
    void startRef.current();
  }, [enabled, voiceSessionKey, prewarmVoiceClient]);

  // Stop when disabled
  useEffect(() => {
    if (enabled) return;
    if (vapiRef.current) void stop();
    const prewarmed = prewarmedVapiRef.current;
    if (prewarmed) {
      prewarmedVapiRef.current = null;
      void stopVapiClient(prewarmed);
    }
  }, [enabled, stop]);

  // Cleanup on voiceSessionKey change
  useEffect(() => {
    return () => {
      clearDelayedErrorTimeout();
      void stop();
    };
  }, [stop, voiceSessionKey, clearDelayedErrorTimeout]);

  // Cleanup prewarmed on unmount
  useEffect(() => {
    return () => {
      const prewarmed = prewarmedVapiRef.current;
      if (!prewarmed) return;
      prewarmedVapiRef.current = null;
      void stopVapiClient(prewarmed);
    };
  }, []);

  return {
    voiceConnecting: connecting,
    voiceActive: active,
    voiceError: error,
    sttMuted,
    voiceSphereActive: connecting
      ? ("connecting" as const)
      : sttMuted
        ? ("idle" as const)
        : aiSpeaking
          ? ("ai" as const)
          : userSpeaking || active
            ? ("user" as const)
            : ("idle" as const),
    voiceSphereIntensity: sttMuted ? 0 : aiSpeaking ? 0.85 : userSpeaking ? 0.7 : active ? 0.25 : 0,
    startVoice: start,
    stopVoice: stop,
    toggleVoice: toggle,
    toggleStt,
    sendTextToAssistant,
  };
}
