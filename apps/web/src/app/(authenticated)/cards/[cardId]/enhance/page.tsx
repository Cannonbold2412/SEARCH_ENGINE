"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, MessageSquareText, PanelLeft, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChildCardEditForm } from "@/components/builder/forms/child-card-edit-form";
import { ParentCardEditForm } from "@/components/builder/forms/parent-card-edit-form";
import { isPlaceholderChildCard } from "@/components/builder/card/card-details";
import { EnhanceChatPanel, ExperienceFamilyCardPreview, type EnhanceChatMessage } from "@/components/builder";
import { PageLoading } from "@/components/feedback";
import {
  type ChildForm,
  type FillFromTextResponse,
  childToForm,
  childFormToPatch,
  mergeParentForPreview,
  mergeChildForPreview,
  syntheticPreviewChild,
  getParentId,
  applyFilledToParentFormOverwrite,
  buildAiQuestions,
  buildCommitDraftPayload,
} from "@/components/enhance";
import {
  useCardForms,
  useExperienceCardFamilies,
  useEnhanceVapiVoice,
  EXPERIENCE_CARD_FAMILIES_QUERY_KEY,
} from "@/hooks";
import type { ParentCardForm } from "@/hooks/use-card-forms";
import {
  applyCardDraftPatch,
  childTypeToIdMap,
  type CardDraftPatch,
  type EnhanceDraftState,
} from "@/lib/apply-card-draft-patch";
import { buildEditAssistantVariableValues } from "@/lib/build-edit-assistant-variables";
import { api } from "@/lib/api";
import { isVapiEditVoiceConfigured } from "@/lib/vapi-config";
import {
  resetTranscriptStreamRefs,
  upsertStreamingTranscriptMessage,
} from "@/lib/vapi-transcript";
import { useLanguage } from "@/contexts/language-context";
import type { VoiceTranscriptChunk } from "@/hooks/use-enhance-vapi-voice";
import type { ExperienceCard, ExperienceCardChild, ChildValueItem } from "@/lib/types";

export default function EnhanceCardPage() {
  const params = useParams<{ cardId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const cardId = decodeURIComponent(String(params?.cardId ?? ""));
  const { language } = useLanguage();

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
  const [isSavingAllFamily, setIsSavingAllFamily] = useState(false);
  const [saveAllError, setSaveAllError] = useState<string | null>(null);
  const [childForms, setChildForms] = useState<Record<string, ChildForm>>({});
  const [parentRawText, setParentRawText] = useState("");
  const [extraChildFormsByType, setExtraChildFormsByType] = useState<Record<string, ChildForm>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [manualEdit, setManualEdit] = useState(false);
  const [mobileSection, setMobileSection] = useState<"card" | "assistant">("assistant");
  const [chatMessages, setChatMessages] = useState<EnhanceChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatSending, setIsChatSending] = useState(false);
  const initCardRef = useRef<string | null>(null);
  const [isEnhanceFormInitialized, setIsEnhanceFormInitialized] = useState(false);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const committedAssistantTextRef = useRef("");
  const activeUserMessageIdRef = useRef<string | null>(null);
  const committedUserTextRef = useRef("");

  const { editForm, setEditForm, populateParentForm } = useCardForms();

  const resetVoiceTranscriptRefs = useCallback(() => {
    resetTranscriptStreamRefs({
      activeAssistantId: activeAssistantMessageIdRef,
      committedAssistant: committedAssistantTextRef,
      activeUserId: activeUserMessageIdRef,
      committedUser: committedUserTextRef,
    });
  }, []);

  const onVoiceTranscriptChunk = useCallback((chunk: VoiceTranscriptChunk) => {
    const { role, text, isPartial } = chunk;
    setChatMessages((prev) =>
      role === "user"
        ? upsertStreamingTranscriptMessage(
            prev,
            "user",
            text,
            isPartial,
            activeUserMessageIdRef,
            committedUserTextRef
          )
        : upsertStreamingTranscriptMessage(
            prev,
            "assistant",
            text,
            isPartial,
            activeAssistantMessageIdRef,
            committedAssistantTextRef
          )
    );
  }, []);

  useEffect(() => {
    initCardRef.current = null;
    setIsEnhanceFormInitialized(false);
  }, [cardId]);

  useEffect(() => {
    if (isLoading || !parent || !cardId) return;
    if (initCardRef.current === cardId) return;
    initCardRef.current = cardId;
    populateParentForm(parent);
    const next: Record<string, ChildForm> = {};
    for (const child of children) {
      if (child.id) next[child.id] = childToForm(child);
    }
    setChildForms(next);
    setParentRawText(String(parent.raw_text ?? ""));
    setExtraChildFormsByType({});
    setHasUnsavedChanges(false);
    setIsEnhanceFormInitialized(true);
  }, [cardId, parent, children, isLoading, populateParentForm]);

  useEffect(() => {
    resetVoiceTranscriptRefs();
    setChatMessages([]);
    setChatInput("");
  }, [cardId, resetVoiceTranscriptRefs]);

  useEffect(() => {
    setMobileSection("assistant");
  }, [cardId]);

  const childTypeToId = useMemo(() => childTypeToIdMap(children), [children]);

  const previewParent = useMemo(
    () => (parent ? mergeParentForPreview(parent, editForm, parentRawText) : null),
    [parent, editForm, parentRawText]
  );

  const previewChildren = useMemo(() => {
    const merged = children.map((child) =>
      mergeChildForPreview(child, child.id ? childForms[child.id] : undefined)
    );
    const extra: ExperienceCardChild[] = [];
    for (const [ct, form] of Object.entries(extraChildFormsByType)) {
      if (form.items?.length) {
        extra.push(syntheticPreviewChild(ct, form));
      }
    }
    return [...merged, ...extra];
  }, [children, childForms, extraChildFormsByType]);

  const previewFamilyCardProps = {
    parent: previewParent!,
    children: previewChildren,
    defaultExpanded: true,
    onParentPenClick: () => setManualEdit(true),
    onChildPenClick: () => setManualEdit(true),
  };

  /** Server snapshot is enough to start Vapi immediately; merged draft after form init. */
  const variableValuesForVoice = useMemo(() => {
    if (!parent) return {};
    if (!isEnhanceFormInitialized) {
      return buildEditAssistantVariableValues(parent, children);
    }
    const mergedParent = mergeParentForPreview(parent, editForm, parentRawText);
    const mergedChildren = children.map((c) =>
      mergeChildForPreview(c, c.id ? childForms[c.id] : undefined)
    );
    return buildEditAssistantVariableValues(mergedParent, mergedChildren);
  }, [parent, children, isEnhanceFormInitialized, editForm, parentRawText, childForms]);

  const draftRef = useRef<EnhanceDraftState>({
    parentForm: editForm,
    parentRawText,
    childForms,
    extraChildFormsByType,
  });
  useEffect(() => {
    draftRef.current = {
      parentForm: editForm,
      parentRawText,
      childForms,
      extraChildFormsByType,
    };
  }, [editForm, parentRawText, childForms, extraChildFormsByType]);

  const applyVoiceDraftPatch = useCallback(
    (patch: CardDraftPatch) => {
      const next = applyCardDraftPatch(draftRef.current, patch, childTypeToId);
      draftRef.current = next;
      setEditForm(next.parentForm);
      setParentRawText(next.parentRawText);
      setChildForms(next.childForms);
      setExtraChildFormsByType(next.extraChildFormsByType);
      setHasUnsavedChanges(true);
    },
    [childTypeToId, setEditForm]
  );

  const {
    voiceActive,
    voiceError: vapiVoiceError,
    sttMuted,
    voiceSphereActive,
    voiceSphereIntensity,
    startVoice,
    stopVoice,
    toggleVoice,
    toggleStt,
    sendTextToAssistant,
  } = useEnhanceVapiVoice({
    enabled: !manualEdit && !!parent,
    voiceSessionKey: cardId,
    language,
    variableValues: variableValuesForVoice,
    onDraftPatch: applyVoiceDraftPatch,
    onTranscriptChunk: onVoiceTranscriptChunk,
    onTranscriptStreamReset: resetVoiceTranscriptRefs,
  });

  useEffect(() => {
    const encodedCardId = encodeURIComponent(cardId);
    const expectedPath = `/cards/${encodedCardId}/enhance`;
    const expectedDecodedPath = `/cards/${cardId}/enhance`;
    if (!pathname || pathname === expectedPath || pathname === expectedDecodedPath) return;
    void stopVoice();
  }, [pathname, cardId, stopVoice]);

  const resetDraftFromServer = useCallback(() => {
    if (!parent) return;
    populateParentForm(parent);
    const next: Record<string, ChildForm> = {};
    for (const child of children) {
      if (child.id) next[child.id] = childToForm(child);
    }
    setChildForms(next);
    setParentRawText(String(parent.raw_text ?? ""));
    setExtraChildFormsByType({});
    setHasUnsavedChanges(false);
  }, [parent, children, populateParentForm]);

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
          language: language,
        },
      });

      if (!res.filled || Object.keys(res.filled).length === 0) {
        setHasUnsavedChanges(true);
        return mergeParentForPreview(parent, editForm, parentRawText);
      }
      const updates = applyFilledToParentFormOverwrite(res.filled);
      if (Object.keys(updates).length === 0) {
        setHasUnsavedChanges(true);
        return mergeParentForPreview(parent, editForm, parentRawText);
      }
      const mergedForm = { ...editForm, ...updates } as ParentCardForm;
      setEditForm(mergedForm);
      setHasUnsavedChanges(true);
      return mergeParentForPreview(parent, mergedForm, parentRawText);
    },
    [cardId, editForm, parent, parentRawText, setEditForm, language]
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
    setChatInput("");
    setSaveAllError(null);

    if (voiceActive) {
      const userMsg: EnhanceChatMessage = {
        id: `u-${crypto.randomUUID()}`,
        role: "user",
        content: text,
      };
      setChatMessages((prev) => [...prev, userMsg]);
      sendTextToAssistant(text);
      return;
    }

    resetVoiceTranscriptRefs();
    const userMsg: EnhanceChatMessage = {
      id: `u-${crypto.randomUUID()}`,
      role: "user",
      content: text,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsChatSending(true);
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
  }, [chatInput, parent, voiceActive, sendTextToAssistant, fillParentFromAnswer, resetVoiceTranscriptRefs]);

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
            language: language,
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

          setHasUnsavedChanges(true);
        }
      } finally {
        setUpdatingChildId((current) => (current === childId ? null : current));
      }
    },
    [childForms, language]
  );

  const onSaveAllFamily = useCallback(async () => {
    if (!cardId || isSavingAllFamily) return;

    setIsSavingAllFamily(true);
    setSaveAllError(null);
    try {
      const payload = buildCommitDraftPayload(
        editForm,
        parentRawText,
        children,
        childForms,
        extraChildFormsByType
      );
      await api(`/experience-cards/${cardId}/commit-draft`, {
        method: "POST",
        body: payload,
      });

      await queryClient.invalidateQueries({ queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY });
      setHasUnsavedChanges(false);
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
  }, [
    cardId,
    childForms,
    children,
    editForm,
    extraChildFormsByType,
    isSavingAllFamily,
    parentRawText,
    queryClient,
    router,
  ]);

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
      className="flex h-full min-h-0 flex-col overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div className="sticky top-0 z-20 -mx-2 mb-3 shrink-0 border-b border-border/60 bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:-mx-3 sm:px-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
          <Link href="/cards">
              <Button variant="ghost" size="sm" className="shrink-0 rounded-full">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back
            </Button>
          </Link>
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
              Enhance experience
            </h1>
            {hasUnsavedChanges && (
                <span className="hidden whitespace-nowrap text-xs text-amber-500/90 sm:inline">
                Unsaved changes
              </span>
            )}
          </div>
        </div>
          <Button
            type="button"
            size="sm"
            onClick={onSaveAllFamily}
            disabled={isSavingAllFamily || isChatSending}
            className="w-full rounded-full sm:w-auto"
          >
            {isSavingAllFamily ? "Saving…" : "Save & exit"}
          </Button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 lg:hidden">
        <Button
          type="button"
          variant={mobileSection === "card" ? "default" : "outline"}
          className="rounded-xl"
          onClick={() => setMobileSection("card")}
        >
          <PanelLeft className="mr-1.5 h-4 w-4" />
          Card
        </Button>
        <Button
          type="button"
          variant={mobileSection === "assistant" ? "default" : "outline"}
          className="rounded-xl"
          onClick={() => setMobileSection("assistant")}
        >
          <MessageSquareText className="mr-1.5 h-4 w-4" />
          Assistant
        </Button>
      </div>

      {saveAllError && (
        <div className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2">
          <p className="text-sm text-destructive" role="alert">
            {saveAllError}
          </p>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-4">
        {/* Left: live card preview or manual edit */}
        <section
          className={cn(
            "min-h-0 rounded-2xl border border-border/60 bg-card/95 shadow-sm",
            mobileSection !== "card" && "hidden lg:flex",
            "lg:flex"
          )}
        >
          {!manualEdit ? (
            <div className="flex h-full min-h-[18rem] w-full flex-col overflow-hidden lg:min-h-0">
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Live card preview</p>
                  <p className="text-xs text-muted-foreground">Tap the pen icon in cards to edit details.</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setManualEdit(true)}>
                  <PencilLine className="mr-1.5 h-4 w-4" />
                  Edit
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 pr-2 scrollbar-theme sm:p-4">
                {previewParent && (
                  <ExperienceFamilyCardPreview {...previewFamilyCardProps} />
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[18rem] w-full flex-col overflow-hidden lg:min-h-0">
              <div className="mb-1 flex flex-shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Manual edit mode</p>
                  <p className="text-xs text-muted-foreground">Changes stay local until you save.</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground rounded-full"
                    onClick={() => {
                      resetDraftFromServer();
                      setManualEdit(false);
                    }}
                  >
                    Discard
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setManualEdit(false)}>
                    Done
                  </Button>
                </div>
              </div>
              <div className="scrollbar-theme min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-3 pr-2 sm:p-4">
                <ParentCardEditForm
                  form={editForm}
                  onChange={(updates) => {
                    setEditForm((prev) => ({ ...prev, ...updates }));
                    setHasUnsavedChanges(true);
                  }}
                  onSubmit={() => setManualEdit(false)}
                  onCancel={() => {
                    resetDraftFromServer();
                    setManualEdit(false);
                  }}
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
                        className="rounded-xl border border-border/60 bg-background/70 p-4 sm:p-5"
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
                            setHasUnsavedChanges(true);
                          }}
                          onSubmit={() => setHasUnsavedChanges(true)}
                          onCancel={() => {
                            resetDraftFromServer();
                            setManualEdit(false);
                          }}
                          isSubmitting={false}
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
        </section>

        {/* Right: chat */}
        <section
          className={cn(
            "min-h-0",
            mobileSection !== "assistant" && "hidden lg:flex",
            "lg:flex lg:flex-col"
          )}
        >
          <EnhanceChatPanel
            messages={chatMessages}
            input={chatInput}
            onInputChange={setChatInput}
            onSend={handleChatSend}
            isSending={isChatSending}
            disabled={manualEdit}
            placeholder={
              manualEdit
                ? "Finish manual edit to continue chat…"
                : voiceActive && !sttMuted
                  ? "Voice active — or type your answer…"
                  : voiceActive && sttMuted
                    ? "Mic muted — type your response…"
                    : "Connecting voice…"
            }
            voiceError={vapiVoiceError}
            voiceConfigured={isVapiEditVoiceConfigured(language)}
            onVoiceToggle={voiceActive ? toggleStt : undefined}
            voiceDisabled={manualEdit}
            voiceSphereIntensity={voiceSphereIntensity}
            voiceSphereActive={voiceSphereActive}
            sttMuted={sttMuted}
            voiceActive={voiceActive}
          />
        </section>
      </div>
    </motion.div>
  );
}
