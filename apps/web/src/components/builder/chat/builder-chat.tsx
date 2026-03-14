"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/constants";
import { AUTH_TOKEN_KEY } from "@/lib/auth-flow";
import { AiSphere } from "../ai-sphere";
import { CardDetails, getChildDisplaySummary, getChildDisplayTitle, isPlaceholderChildCard } from "../card/card-details";
import {
  EXPERIENCE_CARDS_QUERY_KEY,
  EXPERIENCE_CARD_FAMILIES_QUERY_KEY,
} from "@/hooks";
import type {
  DraftCardFamily,
  DraftSetResponse,
  DetectExperiencesResponse,
} from "@/types";

let Vapi: typeof import("@vapi-ai/web").default | null = null;

const PLACEHOLDER_FIRST_MESSAGE: ChatMessage = {
  id: "0",
  role: "assistant",
  content: "",
};

export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  card?: DraftCardFamily;
};

type Stage =
  | "awaiting_experience"
  | "awaiting_choice"
  | "extracting"
  | "clarifying"
  | "card_ready"
  | "idle";

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

type ClarifyResponse = {
  clarifying_question?: string | null;
  filled?: Record<string, unknown>;
  profile_update?: {
    skills?: string[];
    knowledge_areas?: string[];
    interests?: string[];
    motivations?: string[];
    personality_traits?: string[];
    unique_advantages?: string[];
    opportunities?: string[];
    possible_connections?: string[];
  } | null;
  profile_reflection?: string | null;
  should_stop?: boolean | null;
  stop_reason?: string | null;
  target_type?: string | null;
  target_field?: string | null;
  target_child_type?: string | null;
  progress?: { parent_asked?: number; child_asked?: number; max_parent?: number; max_child?: number } | null;
  asked_history_entry?: ClarifyHistoryEntry | null;
  canonical_family?: { parent?: Record<string, unknown>; children?: unknown[] } | null;
  action?: string | null;
  message?: string | null;
  options?: ClarifyOption[] | null;
  focus_parent_id?: string | null;
};

function buildSummaryFromParent(parent: Record<string, unknown>): string {
  const title = [parent.title, parent.normalized_role].find(Boolean) as string | undefined;
  const company = parent.company_name as string | undefined;
  const start = parent.start_date as string | undefined;
  const end = parent.end_date as string | undefined;
  const summary = parent.summary as string | undefined;
  const parts: string[] = [];
  if (title) parts.push(title);
  if (company) parts.push(`at ${company}`);
  if (start || end) parts.push([start, end].filter(Boolean).join(" – "));
  if (summary) parts.push(summary);
  return parts.join(". ") || "Your experience";
}

function isTranscriptMessage(msg: unknown): msg is { type: string; role?: string; transcriptType?: string; transcript?: string } {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  const type = String(m.type ?? "").toLowerCase();
  return type === "transcript" && typeof (m.transcript ?? m.content) === "string";
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
  translateRawText: (text: string) => Promise<string>;
  onCardsSaved?: () => void;
}

export function BuilderChat({ translateRawText, onCardsSaved }: BuilderChatProps) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([PLACEHOLDER_FIRST_MESSAGE]);
  const [loadingFirstMessage, setLoadingFirstMessage] = useState(true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<Stage>("awaiting_experience");
  const [detectedExperiences, setDetectedExperiences] = useState<DetectExperiencesResponse | null>(null);
  const [currentExperienceText, setCurrentExperienceText] = useState("");
  const [currentCardFamily, setCurrentCardFamily] = useState<DraftCardFamily | null>(null);
  const [clarifyHistory, setClarifyHistory] = useState<ClarifyHistoryEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Voice state (Vapi integration)
  const vapiRef = useRef<InstanceType<typeof import("@vapi-ai/web").default> | null>(null);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  // Default the orb to \"AI speaking\" so the sphere feels alive on first load.
  const [aiSpeaking, setAiSpeaking] = useState(true);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Sphere intensity derived from voice state
  const sphereActive = voiceConnecting
    ? "connecting" as const
    : aiSpeaking
    ? "ai" as const
    : userSpeaking || voiceConnected
    ? "user" as const
    : "idle" as const;

  const sphereIntensity = aiSpeaking ? 0.85 : userSpeaking ? 0.7 : voiceConnected ? 0.25 : 0;

  // Fetch LLM-generated opening question on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ clarifying_question?: string | null }>(
          "/experience-cards/clarify-experience",
          {
            method: "POST",
            body: {
              raw_text: "",
              current_card: {},
              card_type: "parent",
              conversation_history: [],
            },
          }
        );
        const question = res?.clarifying_question?.trim();
        if (!cancelled && question) {
          setMessages((prev) =>
            prev.length > 0
              ? [{ ...prev[0], content: question }, ...prev.slice(1)]
              : [{ ...PLACEHOLDER_FIRST_MESSAGE, content: question }]
          );
        } else if (!cancelled) {
          const fallback =
            "To get a sense of you, tell me about a few things you've worked on or cared about lately. It can be projects, roles, or anything that felt meaningful.";
          setMessages((prev) =>
            prev.length > 0
              ? [{ ...prev[0], content: fallback }, ...prev.slice(1)]
              : [{ ...PLACEHOLDER_FIRST_MESSAGE, content: fallback }]
          );
        }
      } catch {
        if (!cancelled) {
          const fallback =
            "If we were grabbing coffee, what would you be excited to tell me you're working on or exploring right now?";
          setMessages((prev) =>
            prev.length > 0
              ? [{ ...prev[0], content: fallback }, ...prev.slice(1)]
              : [{ ...PLACEHOLDER_FIRST_MESSAGE, content: fallback }]
          );
        }
      } finally {
        if (!cancelled) setLoadingFirstMessage(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cleanup Vapi on unmount
  useEffect(() => {
    return () => {
      if (vapiRef.current) {
        vapiRef.current.stop();
        vapiRef.current = null;
      }
    };
  }, []);

  const addMessage = useCallback((msg: Omit<ChatMessage, "id">) => {
    setMessages((prev) => [...prev, { ...msg, id: String(prev.length + Date.now()) }]);
  }, []);

  const addAssistantReflection = useCallback(
    (content?: string | null) => {
      const text = content?.trim();
      if (!text) return;
      addMessage({ role: "assistant", content: text });
    },
    [addMessage]
  );

  const extractSingle = useCallback(
    async (
      experienceIndex: number,
      experienceCount: number,
      text: string
    ): Promise<{ summary: string; family: DraftCardFamily } | null> => {
      const english = await translateRawText(text);
      const res = await api<DraftSetResponse>("/experience-cards/draft-single", {
        method: "POST",
        body: {
          raw_text: english || text,
          experience_index: experienceIndex,
          experience_count: experienceCount,
        },
      });
      const families = res.card_families ?? [];
      if (families.length === 0) return null;
      const family = families[0];
      setCurrentCardFamily(family);
      setClarifyHistory([]);
      return { summary: buildSummaryFromParent(family.parent as Record<string, unknown>), family };
    },
    [translateRawText]
  );

  const askClarify = useCallback(
    async (
      cardFamily: DraftCardFamily | null,
      history: ClarifyHistoryEntry[],
      opts?: { detectedExperiences?: { index: number; label: string }[]; rawTextOverride?: string }
    ): Promise<ClarifyResponse> => {
      const sourceText = opts?.rawTextOverride ?? currentExperienceText;
      const english = await translateRawText(sourceText);
      const conversation_history = history.map((h) => ({ role: h.role, content: h.text }));
      let last_question_target: { target_type?: string; target_field?: string; target_child_type?: string } | undefined;
      if (history.length > 0 && history[history.length - 1].role === "user") {
        for (let i = history.length - 1; i >= 0; i--) {
          const e = history[i];
          if (e.role === "assistant" && e.kind === "clarify_question" && (e.target_type || e.target_field || e.target_child_type)) {
            last_question_target = {
              target_type: e.target_type ?? undefined,
              target_field: e.target_field ?? undefined,
              target_child_type: e.target_child_type ?? undefined,
            };
            break;
          }
        }
      }
      const body: Record<string, unknown> = {
        raw_text: english || sourceText,
        current_card: (cardFamily?.parent ?? {}) as Record<string, unknown>,
        card_type: "parent",
        conversation_history,
        card_family: cardFamily ? { parent: cardFamily.parent, children: cardFamily.children ?? [] } : undefined,
        asked_history: history.length ? history : undefined,
        last_question_target: last_question_target ?? undefined,
      };
      const parentId = cardFamily?.parent && typeof (cardFamily.parent as { id?: string }).id === "string"
        ? (cardFamily.parent as { id: string }).id
        : undefined;
      if (parentId) body.card_id = parentId;
      if (opts?.detectedExperiences?.length) {
        body.detected_experiences = opts.detectedExperiences.map((e) => ({ index: e.index, label: e.label }));
      }
      return api<ClarifyResponse>("/experience-cards/clarify-experience", {
        method: "POST",
        body,
      });
    },
    [currentExperienceText, translateRawText]
  );

  const mergeFilledIntoCard = useCallback(
    (filled: Record<string, unknown>) => {
      setCurrentCardFamily((prev) => {
        if (!prev) return prev;
        const parent = { ...(prev.parent as Record<string, unknown>), ...filled };
        return { ...prev, parent } as DraftCardFamily;
      });
    },
    []
  );

  // Voice: toggle Vapi connection
  const toggleVoice = useCallback(async () => {
    if (voiceConnected && vapiRef.current) {
      vapiRef.current.stop();
      vapiRef.current = null;
      setVoiceConnected(false);
      setAiSpeaking(false);
      setUserSpeaking(false);
      return;
    }

    setVoiceError(null);
    setVoiceConnecting(true);

    const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) {
      setVoiceError("Please sign in to use voice");
      setVoiceConnecting(false);
      return;
    }
    if (!API_BASE || !API_BASE.startsWith("http")) {
      setVoiceError("API not configured");
      setVoiceConnecting(false);
      return;
    }

    try {
      if (!Vapi) {
        const mod = await import("@vapi-ai/web");
        Vapi = mod.default;
      }
      const proxyBase = `${API_BASE}/convai`;
      const vapi = new Vapi(token, proxyBase);
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
        setVoiceConnecting(false);
        setVoiceConnected(true);
        setVoiceError(null);
      });

      vapi.on("call-end", () => {
        setVoiceConnected(false);
        setAiSpeaking(false);
        setUserSpeaking(false);
        vapiRef.current = null;
        queryClient.invalidateQueries({ queryKey: [EXPERIENCE_CARD_FAMILIES_QUERY_KEY] });
      });

      vapi.on("speech-start", () => {
        setAiSpeaking(true);
        setUserSpeaking(false);
      });
      vapi.on("speech-end", () => {
        setAiSpeaking(false);
      });

      vapi.on("message", (msg: unknown) => {
        if (!isTranscriptMessage(msg)) return;
        const transcriptType = String((msg as Record<string, unknown>).transcriptType ?? "").toLowerCase();
        if (transcriptType && transcriptType !== "final") return;
        const text = (msg.transcript ?? (msg as Record<string, unknown>).content) as string;
        const role = (msg.role === "user" || msg.role === "assistant") ? msg.role : "assistant";
        const t = (text ?? "").trim();
        if (!t) return;
        if (role === "user") setUserSpeaking(true);
        setMessages((prev) => [
          ...prev,
          { id: `${Date.now()}-${prev.length}`, role, content: t },
        ]);
      });

      vapi.on("error", (err) => {
        const errObj = err as Record<string, unknown>;
        const errType = String(errObj?.type ?? "").toLowerCase();
        const errMsg = (err?.message as string) || "";
        const isLocal = typeof window !== "undefined" && /localhost|127\.0\.0\.1/.test(API_BASE);
        const friendlyMsg =
          errType === "start-method-error" && isLocal
            ? "Voice requires a tunnel for local development. Run ngrok http 8000 and set VAPI_CALLBACK_BASE_URL to the ngrok URL."
            : errMsg || "Voice connection error";
        setVoiceError(friendlyMsg);
        setVoiceConnecting(false);
      });

      await vapi.start({});
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : "Could not start voice session");
      setVoiceConnecting(false);
    }
  }, [voiceConnected, queryClient]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText !== undefined ? overrideText : input).trim();
    if (!text || loading) return;
    setInput("");
    addMessage({ role: "user", content: text });

    if (stage === "awaiting_experience") {
      setCurrentExperienceText(text);
      setLoading(true);
      try {
        const english = await translateRawText(text);
        const detect = await api<DetectExperiencesResponse>("/experience-cards/detect-experiences", {
          method: "POST",
          body: { raw_text: english || text },
        });
        const count = detect.count ?? 0;
        const experiences = detect.experiences ?? [];
        if (count === 0 || experiences.length === 0) {
          addMessage({
            role: "assistant",
            content:
              "I might be missing a bit—where were you, and what were you roughly responsible for there?",
          });
          setStage("awaiting_experience");
          return;
        }
        if (count === 1) {
          const result = await extractSingle(1, 1, text);
          if (!result) {
            addMessage({
              role: "assistant",
              content:
                "Can you tell me a bit more—roughly when this was and where you were doing it? Even loose details help me capture it well.",
            });
            setLoading(false);
            return;
          }
          const { summary, family } = result;
          addMessage({
            role: "assistant",
            content: `Here's how I'd describe what you did—tell me if this feels right: **${summary}**\n\nI'm curious about a couple of things so I can really understand it.`,
          });
          const parent = family.parent as Record<string, unknown>;
          const firstClarify = await askClarify(family, [], { rawTextOverride: text });
          const firstEntry: ClarifyHistoryEntry | null = firstClarify.asked_history_entry ?? (firstClarify.clarifying_question ? {
            role: "assistant",
            kind: "clarify_question",
            target_type: firstClarify.target_type ?? null,
            target_field: firstClarify.target_field ?? null,
            target_child_type: firstClarify.target_child_type ?? null,
            text: firstClarify.clarifying_question,
          } : null);
          if (firstClarify.clarifying_question && firstEntry) {
            if (firstClarify.canonical_family?.parent) {
              setCurrentCardFamily((prev) =>
                prev
                  ? { ...prev, parent: firstClarify.canonical_family!.parent as DraftCardFamily["parent"], children: (firstClarify.canonical_family!.children as DraftCardFamily["children"]) ?? prev.children }
                  : prev
              );
            }
            setClarifyHistory([firstEntry]);
            addAssistantReflection(firstClarify.profile_reflection);
            addMessage({ role: "assistant", content: firstClarify.clarifying_question });
            setStage("clarifying");
          } else if (firstClarify.should_stop || (firstClarify.filled && Object.keys(firstClarify.filled).length > 0)) {
            if (firstClarify.filled && Object.keys(firstClarify.filled).length > 0) mergeFilledIntoCard(firstClarify.filled);
            const mergedParent = { ...parent, ...(firstClarify.filled || {}) } as DraftCardFamily["parent"];
            const cardId = (mergedParent as { id?: string }).id;
            if (cardId) {
              try {
                await api("/experience-cards/finalize", {
                  method: "POST",
                  body: { card_id: cardId },
                });
              } catch {
                // Non-fatal
              }
            }
          queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARDS_QUERY_KEY });
          queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY });
          addAssistantReflection(firstClarify.profile_reflection);
          addMessage({
            role: "assistant",
            content:
              "Your experience card is ready. You can edit it anytime in **Your Cards**.\n\nIf another chapter of your story pops into your head later, just tell me and I'll keep updating your profile.",
            card: { ...family, parent: mergedParent },
          });
          setCurrentCardFamily(null);
          setStage("awaiting_experience");
          onCardsSaved?.();
          } else {
            const cardId = (parent as { id?: string }).id;
            if (cardId) {
              try {
                await api("/experience-cards/finalize", {
                  method: "POST",
                  body: { card_id: cardId },
                });
              } catch {
                // Non-fatal
              }
            }
          addAssistantReflection(firstClarify.profile_reflection);
          addMessage({
            role: "assistant",
            content:
              "Your experience card is ready. You can edit it anytime in **Your Cards**.\n\nWhenever you're ready, share another story and I'll weave it into the bigger picture of you.",
            card: family,
          });
          setCurrentCardFamily(null);
          setStage("awaiting_experience");
          queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARDS_QUERY_KEY });
          queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY });
          onCardsSaved?.();
          }
          setLoading(false);
          return;
        }
        setDetectedExperiences({ count, experiences });
        const chooseRes = await askClarify(null, [], { detectedExperiences: experiences, rawTextOverride: text });
        if (chooseRes.action === "choose_focus" && chooseRes.message) {
          const list = (chooseRes.options ?? experiences.map((e) => ({ parent_id: String(e.index), label: e.label })))
            .map((o, i) => `**${i + 1}.** ${o.label}`)
            .join("\n");
          addMessage({
            role: "assistant",
            content: `${chooseRes.message}\n\n${list}\n\nReply with the number to pick one.`,
          });
        } else {
          const list = experiences
            .map((e) => `**${e.index}.** ${e.label}${e.suggested ? " (suggested)" : ""}`)
            .join("\n");
          addMessage({
            role: "assistant",
            content: `I found ${count} experiences. We'll build one card first—which one do you want to add? Reply with the number.\n\n${list}`,
          });
        }
        setStage("awaiting_choice");
      } catch (e) {
        addMessage({
          role: "assistant",
          content: "Something went wrong. Please try again or rephrase your experience.",
        });
        setStage("awaiting_experience");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (stage === "awaiting_choice") {
      const num = parseInt(text.replace(/\D/g, ""), 10);
      const experiences = detectedExperiences?.experiences ?? [];
      const exp = num >= 1 && num <= experiences.length ? experiences[num - 1] : undefined;
      if (!exp || !detectedExperiences) {
          addMessage({
            role: "assistant",
            content: "Which one do you want to add first? Just reply with the number.",
          });
        return;
      }
      setLoading(true);
      setDetectedExperiences(null);
      try {
        const result = await extractSingle(exp.index, detectedExperiences.count, currentExperienceText);
        if (!result) {
          addMessage({
            role: "assistant",
            content:
              "Can you tell me a bit more—where you were and roughly when this was happening? That helps me pin it down.",
          });
          setStage("awaiting_experience");
          setLoading(false);
          return;
        }
        const { summary, family } = result;
        addMessage({
          role: "assistant",
          content: `Here's how I'd sum that up—see if this fits: **${summary}**\n\nI've got a couple of quick questions so I can get the nuances right:`,
        });
        const parent = family.parent as Record<string, unknown>;
        const firstClarify = await askClarify(family, [], { rawTextOverride: currentExperienceText });
        const firstEntryChoice: ClarifyHistoryEntry | null = firstClarify.asked_history_entry ?? (firstClarify.clarifying_question ? {
          role: "assistant",
          kind: "clarify_question",
          target_type: firstClarify.target_type ?? null,
          target_field: firstClarify.target_field ?? null,
          target_child_type: firstClarify.target_child_type ?? null,
          text: firstClarify.clarifying_question,
        } : null);
        if (firstClarify.clarifying_question && firstEntryChoice) {
          if (firstClarify.canonical_family?.parent) {
            setCurrentCardFamily((prev) =>
              prev
                ? { ...prev, parent: firstClarify.canonical_family!.parent as DraftCardFamily["parent"], children: (firstClarify.canonical_family!.children as DraftCardFamily["children"]) ?? prev.children }
                : prev
            );
          }
          setClarifyHistory([firstEntryChoice]);
          addAssistantReflection(firstClarify.profile_reflection);
          addMessage({ role: "assistant", content: firstClarify.clarifying_question });
          setStage("clarifying");
        } else if (firstClarify.should_stop || (firstClarify.filled && Object.keys(firstClarify.filled).length > 0)) {
          if (firstClarify.filled && Object.keys(firstClarify.filled).length > 0) mergeFilledIntoCard(firstClarify.filled);
          const mergedParent = { ...parent, ...(firstClarify.filled || {}) } as DraftCardFamily["parent"];
          const cardId = (mergedParent as { id?: string }).id;
          if (cardId) {
            try {
              await api("/experience-cards/finalize", {
                method: "POST",
                body: { card_id: cardId },
              });
            } catch {
              // Non-fatal
            }
          }
          queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARDS_QUERY_KEY });
          queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY });
          addAssistantReflection(firstClarify.profile_reflection);
          addMessage({
            role: "assistant",
            content:
              "Your experience card is ready. You can edit it anytime in **Your Cards**.\n\nThis is really helpful—if another story or project comes to mind, tell me about it and I'll keep building up your profile.",
            card: { ...family, parent: mergedParent },
          });
          setCurrentCardFamily(null);
          setStage("awaiting_experience");
          onCardsSaved?.();
        } else {
          const cardId = (parent as { id?: string }).id;
          if (cardId) {
            try {
              await api("/experience-cards/finalize", {
                method: "POST",
                body: { card_id: cardId },
              });
            } catch {
              // Non-fatal
            }
            }
            addAssistantReflection(firstClarify.profile_reflection);
            addMessage({
              role: "assistant",
              content:
                "Your experience card is ready. You can edit it anytime in **Your Cards**.\n\nIf you think of another story—big or small—share it and I'll fold it into how I understand you.",
              card: family,
            });
            setCurrentCardFamily(null);
            setStage("awaiting_experience");
            queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARDS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY });
            onCardsSaved?.();
        }
      } catch (e) {
        addMessage({
          role: "assistant",
          content:
            "I got a bit tangled up processing that. Mind trying it again in your own words so I can do it justice?",
        });
        setStage("awaiting_experience");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (stage === "clarifying") {
      const userEntry: ClarifyHistoryEntry = { role: "user", kind: "clarify_answer", text };
      const history = [...clarifyHistory, userEntry];
      setClarifyHistory(history);
      setLoading(true);
      try {
        const res = await askClarify(currentCardFamily, history);
        const nextEntry: ClarifyHistoryEntry | null = res.asked_history_entry ?? (res.clarifying_question ? {
          role: "assistant",
          kind: "clarify_question",
          target_type: res.target_type ?? null,
          target_field: res.target_field ?? null,
          target_child_type: res.target_child_type ?? null,
          text: res.clarifying_question,
        } : null);
        if (res.clarifying_question && nextEntry) {
          if (res.canonical_family?.parent) {
            setCurrentCardFamily((prev) =>
              prev
                ? { ...prev, parent: res.canonical_family!.parent as DraftCardFamily["parent"], children: (res.canonical_family!.children as DraftCardFamily["children"]) ?? prev.children }
                : prev
            );
          }
          setClarifyHistory((h) => [...h, nextEntry]);
          addAssistantReflection(res.profile_reflection);
          addMessage({ role: "assistant", content: res.clarifying_question });
        } else if (res.should_stop || (res.filled && Object.keys(res.filled).length > 0)) {
          if (res.filled && Object.keys(res.filled).length > 0) mergeFilledIntoCard(res.filled);
          setClarifyHistory([]);
          const parent = (currentCardFamily?.parent ?? {}) as Record<string, unknown>;
          const mergedParent = { ...parent, ...(res.filled || {}) } as DraftCardFamily["parent"];
          const cardId = (mergedParent as { id?: string }).id;
          if (cardId) {
            try {
              await api("/experience-cards/finalize", {
                method: "POST",
                body: { card_id: cardId },
              });
            } catch {
              // Non-fatal
            }
          }
          queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARDS_QUERY_KEY });
          queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY });
          const finalFamily: DraftCardFamily = currentCardFamily
            ? { ...currentCardFamily, parent: mergedParent }
            : { parent: mergedParent, children: [] };
          addAssistantReflection(res.profile_reflection);
          addMessage({
            role: "assistant",
            content:
              "Your experience card is ready. You can edit it anytime in **Your Cards**.\n\nThis already says a lot about you—if another example comes to mind later, tell me and I'll keep deepening your profile.",
            card: finalFamily,
          });
          setCurrentCardFamily(null);
          setStage("awaiting_experience");
          onCardsSaved?.();
        } else {
          const parent = (currentCardFamily?.parent ?? {}) as Record<string, unknown>;
          const cardId = (parent as { id?: string }).id;
          if (cardId) {
            try {
              await api("/experience-cards/finalize", {
                method: "POST",
                body: { card_id: cardId },
              });
            } catch {
              // Non-fatal
            }
          }
          addAssistantReflection(res.profile_reflection);
          addMessage({
            role: "assistant",
            content:
              "Your experience card is ready. You can edit it anytime in **Your Cards**.\n\nWhenever you feel like it, share another story and I'll keep connecting the dots on your skills and interests.",
            card: currentCardFamily ?? undefined,
          });
          setCurrentCardFamily(null);
          setStage("awaiting_experience");
          queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARDS_QUERY_KEY });
          queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY });
          onCardsSaved?.();
        }
      } catch (e) {
        addMessage({
          role: "assistant",
          content: "I had trouble with that. You can edit the card later in Your Cards.",
        });
        setStage("awaiting_experience");
      } finally {
        setLoading(false);
      }
    }
  }, [
    input,
    loading,
    stage,
    currentExperienceText,
    currentCardFamily,
    detectedExperiences,
    clarifyHistory,
    addMessage,
    addAssistantReflection,
    translateRawText,
    extractSingle,
    askClarify,
    mergeFilledIntoCard,
    queryClient,
    onCardsSaved,
  ]);

  return (
    <div className="relative flex flex-col h-full min-h-0 rounded-xl border border-border bg-card overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
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
                  {msg.id === "0" && loadingFirstMessage ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                      Thinking…
                    </span>
                  ) : (
                    msg.content.replace(/\*\*(.*?)\*\*/g, "$1")
                  )}
                </p>
                {msg.card && (
                  <>
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <CardDetails
                        card={msg.card.parent as Record<string, unknown>}
                        compact
                        hideInternalFields
                      />
                    </div>
                    {(() => {
                      const visibleChildren = (msg.card.children ?? []).filter(
                        (c: Record<string, unknown>) => !isPlaceholderChildCard(c)
                      );
                      if (visibleChildren.length === 0) return null;
                      return (
                        <div className="mt-2 pt-2 border-t border-border/40 space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            {visibleChildren.length} thread{visibleChildren.length !== 1 ? "s" : ""}
                          </p>
                          <ul className="space-y-1">
                            {visibleChildren.map((child: Record<string, unknown>, i: number) => {
                              const headline = getChildDisplayTitle(child) || "Detail";
                              const summary = getChildDisplaySummary(child);
                              return (
                                <li
                                  key={i}
                                  className="text-xs rounded-md border border-border/40 bg-muted/30 px-2 py-1.5"
                                >
                                  <span className="font-medium text-foreground">{headline}</span>
                                  {summary && headline !== summary && (
                                    <p className="mt-0.5 text-muted-foreground line-clamp-2">
                                      {summary}
                                    </p>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })()}
                    <Link
                      href="/cards"
                      className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-primary hover:underline rounded-md bg-primary/5 px-2 py-1 border border-primary/20 transition-colors hover:bg-primary/10"
                    >
                      View in Your Cards
                    </Link>
                  </>
                )}
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
            Voice connected — speak naturally or type. Tap the orb to disconnect.
          </p>
        )}
        {!voiceConnected && (
          <p className="text-[11px] text-center text-muted-foreground mb-0">
            Tap the orb to start voice, or just type
          </p>
        )}
      </div>
    </div>
  );
}
