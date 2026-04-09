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
  stopVapiClient,
  type VapiClient,
} from "@/lib/vapi-client";
import {
  getVapiEditAssistantId,
  getVapiPublicKey,
  isVapiEditVoiceConfigured,
} from "@/lib/vapi-config";

export type VoiceTranscriptChunk = {
  role: "assistant" | "user";
  text: string;
  isPartial: boolean;
};

type UseEnhanceVapiVoiceOptions = {
  /** When false, voice controls are disabled (e.g. manual edit mode). */
  enabled: boolean;
  /**
   * When this value changes (or the host unmounts), any active call is ended.
   * Pass e.g. the card id so switching cards does not keep the previous session alive.
   */
  voiceSessionKey?: string;
  /** Preferred language — selects edit assistant id via `vapi-config` (static NEXT_PUBLIC_* reads). */
  language?: string;
  variableValues: Record<string, string>;
  onDraftPatch: (patch: CardDraftPatch) => void;
  /** Vapi speech/transcript events → merge into chat UI (same sources as builder). */
  onTranscriptChunk?: (chunk: VoiceTranscriptChunk) => void;
  /** New speech segment / call ended — reset streaming bubble refs. */
  onTranscriptStreamReset?: () => void;
};

/**
 * Vapi session for the edit-card assistant: forwards `update_card_draft` tool payloads only.
 * Create vs edit assistants use different dashboard IDs (`NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID`).
 */
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
  const variableValuesRef = useRef(variableValues);
  const onDraftPatchRef = useRef(onDraftPatch);
  const onTranscriptChunkRef = useRef(onTranscriptChunk);
  const onTranscriptStreamResetRef = useRef(onTranscriptStreamReset);
  /** Set when `call-start` fires — Vapi sometimes emits a transient `error` with message "Voice error" first. */
  const callHasStartedRef = useRef(false);
  const delayedErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDelayedErrorTimeout = useCallback(() => {
    if (delayedErrorTimeoutRef.current) {
      clearTimeout(delayedErrorTimeoutRef.current);
      delayedErrorTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    variableValuesRef.current = variableValues;
  }, [variableValues]);

  const [connecting, setConnecting] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Orb animation — false until the assistant actually speaks. */
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);

  useEffect(() => {
    onDraftPatchRef.current = onDraftPatch;
  }, [onDraftPatch]);

  useEffect(() => {
    onTranscriptChunkRef.current = onTranscriptChunk;
  }, [onTranscriptChunk]);

  useEffect(() => {
    onTranscriptStreamResetRef.current = onTranscriptStreamReset;
  }, [onTranscriptStreamReset]);

  const detach = useCallback((target?: VapiClient | null) => {
    if (!target || vapiRef.current === target) {
      vapiRef.current = null;
    }
  }, []);

  const stop = useCallback(async () => {
    clearDelayedErrorTimeout();
    const vapi = vapiRef.current;
    if (!vapi) return;
    await stopVapiClient(vapi);
    detach(vapi);
    setActive(false);
    setAiSpeaking(false);
    setUserSpeaking(false);
    setError(null);
    callHasStartedRef.current = false;
  }, [detach, clearDelayedErrorTimeout]);

  const start = useCallback(async () => {
    if (!isVapiEditVoiceConfigured(language)) {
      setError(
        "Voice is not configured. Set NEXT_PUBLIC_VAPI_PUBLIC_KEY and NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID in apps/web/.env.local (Vapi dashboard -> API keys)."
      );
      return;
    }
    const publicKey = getVapiPublicKey();
    const assistantId = getVapiEditAssistantId(language);
    if (vapiRef.current) {
      return;
    }
    setError(null);
    setConnecting(true);
    callHasStartedRef.current = false;
    clearDelayedErrorTimeout();
    let vapi: VapiClient | null = null;
    try {
      vapi = await createPatchedVapiClient(publicKey);
      const client = vapi;
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
          callHasStartedRef.current = false;
          setActive(false);
          setConnecting(false);
          setAiSpeaking(false);
          setUserSpeaking(false);
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
            setActive(false);
            setConnecting(false);
            setAiSpeaking(false);
            setUserSpeaking(false);
            setError(null);
          });
          return;
        }
        const raw = getVapiErrorMessage(err).trim();
        const msg = raw || "Voice connection error";
        const isGenericSdkLabel = /^(voice error|error)$/i.test(msg);

        // Often fires right after `call-start`; connection is fine — do not show or tear down.
        if (callHasStartedRef.current && isGenericSdkLabel) {
          return;
        }

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
              setConnecting(false);
              setActive(false);
              setAiSpeaking(false);
              setUserSpeaking(false);
              setError(msg);
            })();
          }, 550);
          return;
        }

        void (async () => {
          await stopVapiClient(client);
          detach(client);
          setConnecting(false);
          setActive(false);
          setAiSpeaking(false);
          setUserSpeaking(false);
          setError(msg);
        })();
      });

      await client.start(assistantId, { variableValues: variableValuesRef.current });
    } catch (e) {
      if (vapi) {
        await stopVapiClient(vapi).catch(() => {});
      }
      detach(vapi);
      clearDelayedErrorTimeout();
      setConnecting(false);
      setActive(false);
      setAiSpeaking(false);
      setUserSpeaking(false);
      if (!isBenignVapiDisconnectError(e)) {
        setError(e instanceof Error ? e.message : "Could not start voice");
      }
    }
  }, [language, detach, clearDelayedErrorTimeout]);

  const toggle = useCallback(async () => {
    if (active || vapiRef.current) {
      await stop();
      return;
    }
    await start();
  }, [active, start, stop]);

  useEffect(() => {
    return () => {
      clearDelayedErrorTimeout();
      void stop();
    };
  }, [stop, voiceSessionKey, clearDelayedErrorTimeout]);

  useEffect(() => {
    if (!enabled && vapiRef.current) {
      const cleanup = window.setTimeout(() => {
        void stop();
      }, 0);
      return () => window.clearTimeout(cleanup);
    }
  }, [enabled, stop]);

  const sphereActive = connecting
    ? ("connecting" as const)
    : aiSpeaking
      ? ("ai" as const)
      : userSpeaking || active
        ? ("user" as const)
        : ("idle" as const);
  const sphereIntensity = aiSpeaking ? 0.85 : userSpeaking ? 0.7 : active ? 0.25 : 0;

  return {
    voiceConnecting: connecting,
    voiceActive: active,
    voiceError: error,
    voiceSphereActive: sphereActive,
    voiceSphereIntensity: sphereIntensity,
    startVoice: start,
    stopVoice: stop,
    toggleVoice: toggle,
  };
}
