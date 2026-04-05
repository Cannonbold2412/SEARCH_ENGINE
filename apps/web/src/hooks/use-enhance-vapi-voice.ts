"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CardDraftPatch } from "@/lib/apply-card-draft-patch";
import { extractUpdateCardDraftPatch } from "@/lib/vapi-card-draft-messages";
import { extractTranscriptText, isTranscriptPartial } from "@/lib/vapi-transcript";
import {
  createPatchedVapiClient,
  isBenignVapiDisconnectError,
  preloadVapiWeb,
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
  const onDraftPatchRef = useRef(onDraftPatch);
  const onTranscriptChunkRef = useRef(onTranscriptChunk);
  const onTranscriptStreamResetRef = useRef(onTranscriptStreamReset);

  const [connecting, setConnecting] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Orb animation (aligned with builder chat). */
  const [aiSpeaking, setAiSpeaking] = useState(true);
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
    const vapi = vapiRef.current;
    detach(vapi);
    if (!vapi) return;
    try {
      await vapi.stop();
    } catch (e) {
      if (!isBenignVapiDisconnectError(e)) {
        console.warn("Vapi stop:", e);
      }
    }
    setActive(false);
    setAiSpeaking(false);
    setUserSpeaking(false);
  }, [detach]);

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
    let vapi: VapiClient | null = null;
    try {
      await preloadVapiWeb();
      vapi = await createPatchedVapiClient(publicKey);
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
        setActive(true);
        setConnecting(false);
        setAiSpeaking(true);
        setUserSpeaking(false);
      });
      vapi.on("call-end", () => {
        onTranscriptStreamResetRef.current?.();
        detach(vapi);
        setActive(false);
        setConnecting(false);
        setAiSpeaking(false);
        setUserSpeaking(false);
      });
      vapi.on("speech-start", () => {
        onTranscriptStreamResetRef.current?.();
        setAiSpeaking(true);
        setUserSpeaking(false);
      });
      vapi.on("speech-end", () => {
        setAiSpeaking(false);
      });
      vapi.on("message", (msg: unknown) => {
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
      vapi.on("error", (err: unknown) => {
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message?: string }).message)
            : "Voice error";
        setError(msg);
        detach(vapi);
        setActive(false);
        setConnecting(false);
        setAiSpeaking(false);
        setUserSpeaking(false);
      });

      await vapi.start(assistantId, { variableValues });
    } catch (e) {
      detach(vapi);
      setConnecting(false);
      setActive(false);
      setAiSpeaking(false);
      setUserSpeaking(false);
      if (!isBenignVapiDisconnectError(e)) {
        setError(e instanceof Error ? e.message : "Could not start voice");
      }
    }
  }, [language, variableValues, detach]);

  const toggle = useCallback(async () => {
    if (active || vapiRef.current) {
      await stop();
      return;
    }
    await start();
  }, [active, start, stop]);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop, voiceSessionKey]);

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
