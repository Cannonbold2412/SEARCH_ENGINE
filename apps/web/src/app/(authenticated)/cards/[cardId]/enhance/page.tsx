"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChildCardEditForm } from "@/components/builder/forms/child-card-edit-form";
import { ParentCardEditForm } from "@/components/builder/forms/parent-card-edit-form";
import { isPlaceholderChildCard } from "@/components/builder/card/card-details";
import { EnhanceChatPanel, ExperienceFamilyCardPreview, type EnhanceChatMessage } from "@/components/builder";
import { PageLoading } from "@/components/feedback";
import {
  useCardForms,
  useCardMutations,
  useExperienceCardFamilies,
  EXPERIENCE_CARD_FAMILIES_QUERY_KEY,
} from "@/hooks";
import type { ParentCardForm } from "@/hooks/use-card-forms";
import { api } from "@/lib/api";
import type {
  ChildValueItem,
  DraftCardFamily,
  ExperienceCard,
  ExperienceCardChild,
  ExperienceCardChildPatch,
  ExperienceCardPatch,
} from "@/types";

function getParentId(parent: ExperienceCard | Record<string, unknown>): string {
  const p = parent as Record<string, unknown>;
  return String(p.id ?? p.card_id ?? "").trim();
}

function parentFormToPatch(form: {
  title: string;
  summary: string;
  normalized_role: string;
  domain: string;
  sub_domain: string;
  company_name: string;
  company_type: string;
  location: string;
  employment_type: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  intent_primary: string;
  intent_secondary_str: string;
  seniority_level: string;
  confidence_score: string;
  experience_card_visibility: boolean;
}): ExperienceCardPatch {
  const intentSecondary = form.intent_secondary_str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const confidence =
    form.confidence_score.trim() === ""
      ? null
      : Number(form.confidence_score);
  return {
    title: form.title.trim() || null,
    summary: form.summary.trim() || null,
    normalized_role: form.normalized_role.trim() || null,
    domain: form.domain.trim() || null,
    sub_domain: form.sub_domain.trim() || null,
    company_name: form.company_name.trim() || null,
    company_type: form.company_type.trim() || null,
    location: form.location.trim() || null,
    employment_type: form.employment_type.trim() || null,
    start_date: form.start_date.trim() || null,
    end_date: form.end_date.trim() || null,
    is_current: form.is_current,
    intent_primary: form.intent_primary.trim() || null,
    intent_secondary: intentSecondary.length ? intentSecondary : null,
    seniority_level: form.seniority_level.trim() || null,
    confidence_score: confidence,
    experience_card_visibility: form.experience_card_visibility,
  };
}

function mergeParentForPreview(parent: ExperienceCard, form: ParentCardForm): ExperienceCard {
  const patch = parentFormToPatch(form);
  return {
    ...parent,
    ...patch,
    intent_secondary: patch.intent_secondary ?? parent.intent_secondary,
    experience_card_visibility:
      patch.experience_card_visibility ?? parent.experience_card_visibility,
  };
}

type FillFromTextResponse = {
  filled?: Record<string, unknown>;
};

type ChildForm = {
  title: string;
  summary: string;
  items: ChildValueItem[];
};

function normalizeChildItem(item: ChildValueItem | Record<string, unknown>): ChildValueItem {
  const raw = item as Record<string, unknown>;
  return {
    subtitle: String(raw.subtitle ?? raw.title ?? "").trim(),
    sub_summary: (raw.sub_summary ?? raw.description ?? null) as string | null,
  };
}

const PARENT_FORM_KEYS = new Set([
  "title", "summary", "normalized_role", "domain", "sub_domain", "company_name", "company_type",
  "location", "employment_type", "start_date", "end_date", "is_current", "intent_primary",
  "intent_secondary_str", "seniority_level", "confidence_score", "experience_card_visibility",
]);

function applyFilledToParentFormOverwrite(filled: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const key of Object.keys(filled)) {
    if (PARENT_FORM_KEYS.has(key)) {
      const val = filled[key];
      if (val !== undefined && val !== null) updates[key] = val;
    }
  }
  if (Array.isArray(filled.intent_secondary) && filled.intent_secondary.length > 0) {
    updates.intent_secondary_str = (filled.intent_secondary as string[])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .join(", ");
  }
  return updates;
}

function buildAiQuestions(card: ExperienceCard): string[] {
  const questions: string[] = [];
  if (!card.summary?.trim()) questions.push("What problem did you solve, and what measurable result came from it?");
  if (!card.normalized_role?.trim()) questions.push("What was your exact role title and core responsibility in this experience?");
  if (!card.company_type?.trim()) questions.push("What kind of company was this (startup, enterprise, agency, nonprofit, etc.)?");
  if (!card.employment_type?.trim()) questions.push("Was this full-time, part-time, contract, internship, or freelance?");
  if (!card.domain?.trim()) questions.push("Which domain best describes this work (e.g. fintech, healthtech, e-commerce)?");
  if (!card.seniority_level?.trim()) questions.push("What seniority level best matches this role (junior, mid, senior, lead)?");
  if (!card.location?.trim()) questions.push("Where was this role based (city/remote/hybrid)?");
  if (questions.length === 0) {
    questions.push("Which tools or technologies had the biggest impact in this role?");
    questions.push("What would a recruiter need to know in 2 lines to understand your impact?");
  }
  return questions.slice(0, 4);
}

function childToForm(child: ExperienceCardChild): ChildForm {
  const rawItems = (Array.isArray(child.items) ? child.items : []) as Array<
    ChildValueItem | Record<string, unknown>
  >;
  const items: ChildValueItem[] =
    rawItems.length > 0
      ? rawItems.map((it) => normalizeChildItem(it))
      : [{ subtitle: "", sub_summary: null }];
  const first = items[0];
  const title = first?.subtitle ?? "";
  const summary = first?.sub_summary ?? "";

  return { title, summary, items };
}

function childFormToPatch(form: ChildForm): ExperienceCardChildPatch {
  const rawItems = form.items
    .map((it) => ({
      subtitle: (it.subtitle ?? "").trim(),
      sub_summary: (it.sub_summary ?? "").trim() || null,
    }))
    .filter((it) => it.subtitle);

  const title = form.title.trim();
  const summary = form.summary.trim();
  const items =
    rawItems.length > 0
      ? rawItems.map((it, i) =>
          i === 0
            ? {
                subtitle: title || it.subtitle,
                sub_summary: summary || it.sub_summary,
              }
            : it
        )
      : title || summary
        ? [{ subtitle: title || "Untitled", sub_summary: summary || null }]
        : [];

  return { items };
}

function mergeChildForPreview(child: ExperienceCardChild, form: ChildForm | undefined): ExperienceCardChild {
  if (!form) return child;
  const patch = childFormToPatch(form);
  return {
    ...child,
    items: patch.items ?? child.items,
  };
}

export default function EnhanceCardPage() {
  const params = useParams<{ cardId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const cardId = decodeURIComponent(String(params?.cardId ?? ""));

  const { data: savedFamilies = [], isLoading } = useExperienceCardFamilies();
  const family = savedFamilies.find((f) => getParentId(f.parent as ExperienceCard) === cardId);
  const parent = (family?.parent ?? null) as ExperienceCard | null;
  const children = useMemo(
    () =>
      ((family?.children ?? []) as ExperienceCardChild[]).filter(
        (child) => !isPlaceholderChildCard(child as Record<string, unknown>)
      ),
    [family]
  );

  const [isUpdatingFromMessyText, setIsUpdatingFromMessyText] = useState(false);
  const [updatingChildId, setUpdatingChildId] = useState<string | null>(null);
  const [submittingChildId, setSubmittingChildId] = useState<string | null>(null);
  const [isSavingAllFamily, setIsSavingAllFamily] = useState(false);
  const [saveAllError, setSaveAllError] = useState<string | null>(null);
  const [childForms, setChildForms] = useState<Record<string, ChildForm>>({});
  const [, setDraftFamilies] = useState<DraftCardFamily[] | null>(null);
  const noop = useCallback(() => {}, []);

  const [manualEdit, setManualEdit] = useState(false);
  const [chatMessages, setChatMessages] = useState<EnhanceChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatSending, setIsChatSending] = useState(false);
  const chatInitRef = useRef(false);

  const { editForm, setEditForm, populateParentForm } = useCardForms();
  const { patchChildMutation } = useCardMutations(
    setDraftFamilies,
    noop,
    noop,
    noop,
    noop
  );

  useEffect(() => {
    if (parent) {
      populateParentForm(parent);
    }
  }, [parent, populateParentForm]);

  useEffect(() => {
    chatInitRef.current = false;
    setChatMessages([]);
    setChatInput("");
  }, [cardId]);

  useEffect(() => {
    const next: Record<string, ChildForm> = {};
    for (const child of children) {
      if (child.id) next[child.id] = childToForm(child);
    }
    setChildForms(next);
  }, [children]);

  useEffect(() => {
    if (!parent || chatInitRef.current) return;
    chatInitRef.current = true;
    const qs = buildAiQuestions(parent);
    const intro =
      "I'll ask a few short questions so this experience is richer for search and recruiters.";
    const first =
      qs[0] ??
      "What impact did you deliver in this role (including metrics if you have them)?";
    setChatMessages([
      {
        id: `intro-${Date.now()}`,
        role: "assistant",
        content: `${intro}\n\n${first}`,
      },
    ]);
  }, [parent]);

  const previewParent = useMemo(
    () => (parent ? mergeParentForPreview(parent, editForm) : null),
    [parent, editForm]
  );

  const previewChildren = useMemo(() => {
    return children.map((child) =>
      mergeChildForPreview(child, child.id ? childForms[child.id] : undefined)
    );
  }, [children, childForms]);

  const fillParentFromAnswer = useCallback(
    async (text: string): Promise<ExperienceCard> => {
      if (!cardId || !text.trim() || !parent) {
        throw new Error("Missing card or text");
      }
      const currentCard = editForm as unknown as Record<string, unknown>;
      const res = await api<FillFromTextResponse>("/experience-cards/fill-missing-from-text", {
        method: "POST",
        body: {
          raw_text: text.trim(),
          current_card: currentCard,
          card_type: "parent",
        },
      });

      let mergedForm: ParentCardForm;
      setEditForm((prev) => {
        if (!res.filled || Object.keys(res.filled).length === 0) {
          mergedForm = prev;
          return prev;
        }
        const updates = applyFilledToParentFormOverwrite(res.filled);
        if (Object.keys(updates).length === 0) {
          mergedForm = prev;
          return prev;
        }
        mergedForm = { ...prev, ...updates } as ParentCardForm;
        return mergedForm;
      });

      await queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY });
      return mergeParentForPreview(parent, mergedForm!);
    },
    [cardId, editForm, parent, queryClient, setEditForm]
  );

  const onUpdateParentFromMessyText = useCallback(
    async (text: string) => {
      if (!cardId || !text.trim()) return;
      setIsUpdatingFromMessyText(true);
      try {
        await fillParentFromAnswer(text);
      } finally {
        setIsUpdatingFromMessyText(false);
      }
    },
    [cardId, fillParentFromAnswer]
  );

  const handleChatSend = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || !parent) return;
    const userMsg: EnhanceChatMessage = {
      id: `u-${crypto.randomUUID()}`,
      role: "user",
      content: text,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsChatSending(true);
    setSaveAllError(null);
    try {
      const afterCard = await fillParentFromAnswer(text);
      const qs = buildAiQuestions(afterCard);
      const nextQ =
        qs[0] ??
        "Thanks — your card is looking detailed. Use the pencil on the left to edit anything, or save when done.";
      const followUp =
        qs.length > 0
          ? `Thanks — I've updated your card. Here's another question:\n\n${nextQ}`
          : `Thanks — I've updated your card.\n\n${nextQ}`;
      setChatMessages((prev) => [
        ...prev,
        {
          id: `a-${crypto.randomUUID()}`,
          role: "assistant",
          content: followUp,
        },
      ]);
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Could not update from your answer. Try again.";
      setSaveAllError(message);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `a-${crypto.randomUUID()}`,
          role: "assistant",
          content: `Something went wrong: ${message}. You can still edit your card with the pencil on the left.`,
        },
      ]);
    } finally {
      setIsChatSending(false);
    }
  }, [chatInput, parent, fillParentFromAnswer]);

  const onSubmitChild = useCallback(
    (childId: string) => {
      const form = childForms[childId];
      if (!form) return;
      const body = childFormToPatch(form);
      setSubmittingChildId(childId);
      patchChildMutation.mutate(
        { childId, body },
        {
          onSettled: () => setSubmittingChildId((current) => (current === childId ? null : current)),
        }
      );
    },
    [childForms, patchChildMutation]
  );

  const onUpdateChildFromMessyText = useCallback(
    async (childId: string, text: string) => {
      const form = childForms[childId];
      if (!form || !text.trim()) return;
      setUpdatingChildId(childId);
      try {
        const res = await api<FillFromTextResponse>("/experience-cards/fill-missing-from-text", {
          method: "POST",
          body: {
            raw_text: text.trim(),
            current_card: form as unknown as Record<string, unknown>,
            card_type: "child",
            child_id: childId,
          },
        });

        if (res.filled && Object.keys(res.filled).length > 0) {
          const currentItems = Array.isArray(form.items) ? form.items : [];
          const currentSubtitles = new Set(
            currentItems
              .map((it) => String(it.subtitle ?? "").trim())
              .filter(Boolean)
          );
          const nextItems = [...currentItems];

          if (Array.isArray(res.filled.items)) {
            for (const raw of res.filled.items as Array<Record<string, unknown>>) {
              const subtitle = String(raw?.subtitle ?? raw?.title ?? "").trim();
              const subSummaryRaw = String(raw?.sub_summary ?? raw?.description ?? "").trim();
              if (subtitle && !currentSubtitles.has(subtitle)) {
                nextItems.push({
                  subtitle,
                  sub_summary: subSummaryRaw || null,
                });
                currentSubtitles.add(subtitle);
              }
            }
          }

          setChildForms((prev) => ({
            ...prev,
            [childId]: {
              title:
                (typeof res.filled?.title === "string" && res.filled.title.trim()) ||
                prev[childId]?.title ||
                form.title,
              summary:
                (typeof res.filled?.summary === "string" && res.filled.summary.trim()) ||
                prev[childId]?.summary ||
                form.summary,
              items: nextItems.length > 0 ? nextItems : form.items,
            },
          }));

          queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY });
        }
      } finally {
        setUpdatingChildId((current) => (current === childId ? null : current));
      }
    },
    [childForms, queryClient]
  );

  const onSaveAllFamily = useCallback(async () => {
    if (!cardId || isSavingAllFamily) return;

    setIsSavingAllFamily(true);
    setSaveAllError(null);
    try {
      const parentBody = parentFormToPatch(editForm);
      await api<ExperienceCard>(`/experience-cards/${cardId}`, {
        method: "PATCH",
        body: parentBody,
      });

      for (const child of children) {
        if (!child.id) continue;
        const form = childForms[child.id] ?? childToForm(child);
        const body = childFormToPatch(form);
        await api<ExperienceCardChild>(`/experience-card-children/${child.id}`, {
          method: "PATCH",
          body,
        });
      }

      await queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY });
      router.push("/cards");
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Could not save the full family. Please try again.";
      setSaveAllError(message);
    } finally {
      setIsSavingAllFamily(false);
    }
  }, [cardId, childForms, children, editForm, isSavingAllFamily, queryClient, router]);

  if (isLoading) {
    return (
      <PageLoading
        message="Loading experience card..."
        className="py-12 flex flex-col items-center justify-center gap-3"
      />
    );
  }

  if (!parent) {
    return (
      <div className="max-w-3xl mx-auto py-6 space-y-4">
        <p className="text-sm text-muted-foreground">This experience card could not be found.</p>
        <Link href="/cards">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to your cards
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      className="flex flex-col min-h-0 h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] overflow-hidden -mt-2 sm:-mt-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-between gap-3 flex-shrink-0 mb-2 sm:mb-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/cards">
            <Button variant="ghost" size="sm" className="shrink-0">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back
            </Button>
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">
              Enhance experience
            </h1>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onSaveAllFamily}
          disabled={
            isSavingAllFamily ||
            !!submittingChildId ||
            isChatSending ||
            patchChildMutation.isPending
          }
        >
          {isSavingAllFamily ? "Saving…" : "Save & exit"}
        </Button>
      </div>

      {saveAllError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
          <p className="text-sm text-destructive" role="alert">
            {saveAllError}
          </p>
        </div>
      )}

      <div className="flex flex-col md:flex-row flex-1 min-h-0 gap-0 md:gap-4">
        {/* Left: live card preview or manual edit */}
        <div className="flex flex-col min-h-0 h-[42vh] md:h-auto md:flex-1 md:min-w-0 border-b md:border-b-0 md:border-r border-border/60 pb-3 md:pb-0 md:pr-4">
          {!manualEdit ? (
            <div className="flex flex-col min-h-0 h-full overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 scrollbar-theme">
                {previewParent && (
                  <ExperienceFamilyCardPreview
                    parent={previewParent}
                    children={previewChildren}
                    defaultExpanded
                    onParentPenClick={() => setManualEdit(true)}
                    onChildPenClick={() => setManualEdit(true)}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col min-h-0 h-full overflow-hidden">
              <div className="flex items-center justify-between gap-2 flex-shrink-0 mb-2">
                <p className="text-xs text-muted-foreground">Manual edit</p>
                <Button type="button" size="sm" variant="outline" onClick={() => setManualEdit(false)}>
                  Done
                </Button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 scrollbar-theme space-y-4">
                <ParentCardEditForm
                  form={editForm}
                  onChange={(updates) => setEditForm((prev) => ({ ...prev, ...updates }))}
                  onSubmit={() => setManualEdit(false)}
                  onCancel={() => setManualEdit(false)}
                  isSubmitting={false}
                  showDeleteButton={false}
                  checkboxIdPrefix={`enhance-card-${cardId}`}
                  onUpdateFromMessyText={onUpdateParentFromMessyText}
                  isUpdatingFromMessyText={isUpdatingFromMessyText}
                />

                {children.length > 0 && (
                  <div className="space-y-3">
                    {children.map((child, index) => (
                      <div
                        key={child.id || `child-${index}`}
                        className="rounded-xl border border-border/60 bg-card p-4 sm:p-5"
                      >
                        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
                          Detail {index + 1}
                          {child.child_type ? ` - ${String(child.child_type).replace(/_/g, " ")}` : ""}
                        </h3>
                        <ChildCardEditForm
                          form={childForms[child.id] ?? childToForm(child)}
                          onChange={(updates) => {
                            if (!child.id) return;
                            setChildForms((prev) => ({
                              ...prev,
                              [child.id]: { ...(prev[child.id] ?? childToForm(child)), ...updates },
                            }));
                          }}
                          onSubmit={() => {
                            if (child.id) onSubmitChild(child.id);
                          }}
                          onCancel={() => setManualEdit(false)}
                          isSubmitting={submittingChildId === child.id}
                          showDeleteButton={false}
                          onUpdateFromMessyText={(text) =>
                            child.id ? onUpdateChildFromMessyText(child.id, text) : Promise.resolve()
                          }
                          isUpdatingFromMessyText={updatingChildId === child.id}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: chat */}
        <div className="flex flex-col min-h-0 flex-1 md:min-w-0 min-h-[280px] md:min-h-0">
          <EnhanceChatPanel
            messages={chatMessages}
            input={chatInput}
            onInputChange={setChatInput}
            onSend={handleChatSend}
            isSending={isChatSending}
            disabled={manualEdit}
            placeholder={
              manualEdit ? "Finish manual edit to continue chat…" : "Type your answer…"
            }
          />
        </div>
      </div>
    </motion.div>
  );
}
