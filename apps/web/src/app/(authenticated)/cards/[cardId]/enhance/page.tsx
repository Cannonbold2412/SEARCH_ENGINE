"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
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
      <div className="mb-3 flex shrink-0 flex-col gap-3 px-1 sm:mb-3 sm:flex-row sm:items-center sm:justify-between">
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
            {hasUnsavedChanges && (
              <span className="text-xs text-amber-500/90 whitespace-nowrap hidden sm:inline">
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
          className="w-full sm:w-auto"
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

      <div className="flex flex-1 min-h-0 flex-col gap-3 md:flex-row md:gap-4">
        {/* Left: live card preview or manual edit */}
        <div className="flex min-h-[18rem] max-h-[48svh] flex-col border-b border-border/60 pb-3 md:min-h-0 md:max-h-none md:flex-1 md:min-w-0 md:border-b-0 md:border-r md:pb-0 md:pr-4">
          {!manualEdit ? (
            <div className="flex flex-col min-h-0 h-full overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 scrollbar-theme">
                {previewParent && (
                  <ExperienceFamilyCardPreview {...previewFamilyCardProps} />
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col min-h-0 h-full overflow-hidden">
              <div className="flex items-center justify-between gap-2 flex-shrink-0 mb-2">
                <p className="text-xs text-muted-foreground">Manual edit</p>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => {
                      resetDraftFromServer();
                      setManualEdit(false);
                    }}
                  >
                    Discard
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setManualEdit(false)}>
                    Done
                  </Button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 scrollbar-theme space-y-4">
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
        </div>

        {/* Right: chat */}
        <div className="flex min-h-[20rem] flex-1 flex-col md:min-h-0 md:min-w-0">
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
        </div>
      </div>
    </motion.div>
  );
}
