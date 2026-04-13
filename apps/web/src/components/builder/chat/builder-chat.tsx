"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { AiSphere } from "../ai-sphere";
import { BuilderChatFooter } from "./builder-chat-footer";
import { BuilderChatMessages } from "./builder-chat-messages";
import { useBuilderChatVoice } from "./use-builder-chat-voice";
import { useLanguage } from "@/contexts/language-context";
import type { ChatMessage } from "./builder-chat-types";

export type { ChatMessage } from "./builder-chat-types";

interface BuilderChatProps {
  onCardsSaved?: () => void;
}

export function BuilderChat({ onCardsSaved }: BuilderChatProps) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { language } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [sessionId] = useState<string | null>(null);
  const [surfacedInsights, setSurfacedInsights] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [commitStatus, setCommitStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (pathname === "/builder") return;
    setMessages([]);
    setSurfacedInsights([]);
  }, [pathname]);

  useEffect(() => {
    if (commitStatus !== "success") return;
    setMessages([]);
    setSurfacedInsights([]);
    const timer = setTimeout(() => {
      setCommitStatus("idle");
    }, 5000);
    return () => clearTimeout(timer);
  }, [commitStatus]);

  const addMessage = (msg: Omit<ChatMessage, "id">) => {
    setMessages((prev) => [...prev, { ...msg, id: String(prev.length + Date.now()) }]);
  };

  const { voiceConnected, voiceError, sttMuted, sphereActive, sphereIntensity, toggleStt, sendTextToAssistant } = useBuilderChatVoice({
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
    if (voiceConnected) {
      sendTextToAssistant(text);
    } else {
      addMessage({
        role: "assistant",
        content: "Voice is not connected. Please wait for the connection or try again.",
      });
    }
  };

  return (
    <div className="relative flex flex-col h-full min-h-0 rounded-xl border border-border/60 bg-card overflow-hidden">
      <BuilderChatMessages messages={messages} loading={loading} commitStatus={commitStatus} scrollRef={scrollRef} />

      <div className="pointer-events-none absolute bottom-16 right-3 z-20 overflow-visible sm:bottom-10">
        <AiSphere
          intensity={sphereIntensity}
          active={sphereActive}
          size={56}
          onClick={voiceConnected ? toggleStt : undefined}
          aria-label={
            !voiceConnected
              ? "Connecting voice..."
              : sttMuted
                ? "Unmute microphone"
                : "Mute microphone"
          }
          className="pointer-events-auto"
        />
      </div>

      <BuilderChatFooter
        input={input}
        setInput={setInput}
        sendMessage={sendMessage}
        loading={loading}
        voiceConnected={voiceConnected}
        sttMuted={sttMuted}
        voiceError={voiceError}
        surfacedInsights={surfacedInsights}
      />
    </div>
  );
}
