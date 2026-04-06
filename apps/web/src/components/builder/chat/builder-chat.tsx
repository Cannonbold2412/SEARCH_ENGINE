"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { AiSphere } from "../ai-sphere";
import { BuilderChatFooter } from "./builder-chat-footer";
import { BuilderChatMessages } from "./builder-chat-messages";
import { useBuilderChatVoice } from "./use-builder-chat-voice";
import { useLanguage } from "@/contexts/language-context";
import type { ChatMessage, PersistedBuilderChatState } from "./builder-chat-types";

const BUILDER_CHAT_STORAGE_KEY = "builder-chat-state";

export type { ChatMessage } from "./builder-chat-types";

interface BuilderChatProps {
  onCardsSaved?: () => void;
}

function loadPersistedBuilderChatState(): PersistedBuilderChatState {
  if (typeof window === "undefined") {
    return { messages: [], surfacedInsights: [] };
  }
  const raw = sessionStorage.getItem(BUILDER_CHAT_STORAGE_KEY);
  if (!raw) {
    return { messages: [], surfacedInsights: [] };
  }
  try {
    const parsed = JSON.parse(raw) as PersistedBuilderChatState;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      surfacedInsights: Array.isArray(parsed.surfacedInsights) ? parsed.surfacedInsights : [],
    };
  } catch {
    sessionStorage.removeItem(BUILDER_CHAT_STORAGE_KEY);
    return { messages: [], surfacedInsights: [] };
  }
}

export function BuilderChat({ onCardsSaved }: BuilderChatProps) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { language } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadPersistedBuilderChatState().messages);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [sessionId] = useState<string | null>(null);
  const [surfacedInsights, setSurfacedInsights] = useState<string[]>(
    () => loadPersistedBuilderChatState().surfacedInsights
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [commitStatus, setCommitStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const scrollRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (commitStatus !== "success") return;
    const timer = setTimeout(() => {
      setCommitStatus("idle");
    }, 5000);
    return () => clearTimeout(timer);
  }, [commitStatus]);

  const addMessage = (msg: Omit<ChatMessage, "id">) => {
    setMessages((prev) => [...prev, { ...msg, id: String(prev.length + Date.now()) }]);
  };

  const { voiceConnected, voiceError, sphereActive, sphereIntensity, toggleVoice } = useBuilderChatVoice({
    pathname,
    queryClient,
    sessionId,
    messagesRef,
    setMessages,
    setLoading,
    setCommitStatus,
    onCardsSaved,
    language,
  });

  const sendMessage = async (overrideText?: string) => {
    const text = String(overrideText !== undefined ? overrideText : input).trim();
    if (!text || loading) return;
    setInput("");
    addMessage({ role: "user", content: text });
    addMessage({
      role: "assistant",
      content: "Got it. Keep going - I'll create cards when the voice conversation ends.",
    });
  };

  return (
    <div className="relative flex flex-col h-full min-h-0 rounded-xl border border-border/60 bg-card overflow-hidden">
      <BuilderChatMessages messages={messages} loading={loading} commitStatus={commitStatus} scrollRef={scrollRef} />

      <div className="pointer-events-none absolute bottom-10 right-3 z-20 overflow-visible">
        <AiSphere
          intensity={sphereIntensity}
          active={sphereActive}
          size={56}
          onClick={toggleVoice}
          className="pointer-events-auto"
        />
      </div>

      <BuilderChatFooter
        input={input}
        setInput={setInput}
        sendMessage={sendMessage}
        loading={loading}
        voiceConnected={voiceConnected}
        voiceError={voiceError}
        surfacedInsights={surfacedInsights}
      />
    </div>
  );
}
