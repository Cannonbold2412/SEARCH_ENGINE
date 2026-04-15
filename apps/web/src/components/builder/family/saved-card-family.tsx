import { memo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { ParentCardEditForm } from "../forms/parent-card-edit-form";
import { ChildCardEditForm } from "../forms/child-card-edit-form";
import {
  CardDetails,
  displayCardTitle,
  getChildDisplayItems,
  getLocationFromCard,
  isPlaceholderChildCard,
} from "../card/card-details";
import { PenLine, Trash2, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExperienceCard, ExperienceCardChild } from "@/lib/types";
import type { ParentCardForm, ChildCardForm } from "@/hooks/use-card-forms";

type DeleteTarget =
  | { type: "parent"; id: string; label: string }
  | { type: "child"; id: string; label: string };

interface SavedCardFamilyProps {
  parent: ExperienceCard;
  childCards: ExperienceCardChild[];
  /** When true, hides edit/delete and only allows expand + child detail pop-out */
  readOnly?: boolean;
  deletedId?: string | null;
  editingSavedCardId?: string | null;
  editingSavedChildId?: string | null;
  editForm?: ParentCardForm;
  childEditForm?: ChildCardForm;
  onEditFormChange?: (updates: Partial<ParentCardForm>) => void;
  onChildEditFormChange?: (updates: Partial<ChildCardForm>) => void;
  onStartEditing?: (card: ExperienceCard) => void;
  onStartEditingChild?: (child: ExperienceCardChild) => void;
  onCancelEditing?: () => void;
  onCancelEditingChild?: () => void;
  onSubmitEdit?: () => void;
  onSubmitEditChild?: () => void;
  onDelete?: (id: string) => void;
  onDeleteChild?: (id: string) => void;
  isSubmitting?: boolean;
  onUpdateParentFromMessyText?: (text: string) => Promise<void>;
  onUpdateChildFromMessyText?: (text: string) => Promise<void>;
  isUpdatingFromMessyText?: boolean;
  /** True while navigating to enhance and preloading voice (Your Cards pencil). */
  isWarmingVoice?: boolean;
}

export const SavedCardFamily = memo(function SavedCardFamily({
  parent,
  childCards,
  readOnly = false,
  deletedId = null,
  editingSavedCardId = null,
  editingSavedChildId = null,
  editForm,
  childEditForm,
  onEditFormChange,
  onChildEditFormChange,
  onStartEditing,
  onStartEditingChild,
  onCancelEditing,
  onCancelEditingChild,
  onSubmitEdit,
  onSubmitEditChild,
  onDelete,
  onDeleteChild,
  isSubmitting = false,
  onUpdateParentFromMessyText,
  onUpdateChildFromMessyText,
  isUpdatingFromMessyText = false,
  isWarmingVoice = false,
}: SavedCardFamilyProps) {
  const parentId = String(
    (parent as { id?: string })?.id ?? (parent as Record<string, unknown>)?.card_id ?? ""
  ).trim();
  const isEditingParent = !readOnly && editingSavedCardId === parentId;
  const visibleChildren = childCards.filter((c) => !isPlaceholderChildCard(c as Record<string, unknown>));
  const hasChildren = visibleChildren.length > 0;
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewingChildId, setViewingChildId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const handleParentClick = () => {
    if (!hasChildren || isEditingParent) return;
    if (editingSavedChildId && visibleChildren.some((c) => c.id === editingSavedChildId)) return;
    setIsExpanded((prev) => !prev);
  };

  const closeDeleteConfirmation = () => {
    setDeleteTarget(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    closeDeleteConfirmation();
    if (deleteTarget.type === "parent") {
      onDelete?.(deleteTarget.id);
      return;
    }
    onDeleteChild?.(deleteTarget.id);
  };

  const openParentDeleteConfirmation = () => {
    if (!parentId) return;
    setDeleteTarget({
      type: "parent",
      id: parentId,
      label: displayCardTitle(parent.title, parent.company_name || "Untitled"),
    });
  };

  const openChildDeleteConfirmation = (child: ExperienceCardChild) => {
    const relationType = (child.child_type ?? "").toString().trim().replace(/_/g, " ");
    const firstItem = getChildDisplayItems(child)[0];
    const label = firstItem?.title || firstItem?.summary || relationType || "this detail";
    setDeleteTarget({
      type: "child",
      id: child.id,
      label,
    });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className={cn("relative", deletedId === parentId && "opacity-50")}
    >
      {/* Parent card — elevated surface, left accent, stable hover (shadow, not scale) */}
      <div
        className={cn(
          "group relative overflow-hidden rounded-2xl border border-border/50 bg-card pl-4 pr-4 py-5 shadow-sm transition-[box-shadow,border-color,background-color] duration-200 sm:pl-5 sm:pr-5",
          "border-l-[3px] border-l-primary/90",
          hasChildren && !isEditingParent && "cursor-pointer hover:border-border hover:bg-muted/25 hover:shadow-md"
        )}
        onClick={handleParentClick}
        onKeyDown={(e) => {
          if (hasChildren && !isEditingParent && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
        role={hasChildren && !isEditingParent ? "button" : undefined}
        tabIndex={hasChildren && !isEditingParent ? 0 : undefined}
        aria-expanded={hasChildren && !isEditingParent ? isExpanded : undefined}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0 w-full flex-1">
            <h3 className="font-display text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
              {displayCardTitle(parent.title, parent.company_name || "Untitled")}
            </h3>
            {!isEditingParent &&
              (() => {
                const company =
                  parent.company_name && displayCardTitle(parent.title, parent.company_name || "") !== parent.company_name.trim()
                    ? parent.company_name
                    : null;
                const location = getLocationFromCard(parent);
                const parts = [company, location].filter(Boolean);
                return parts.length > 0 ? (
                  <p className="mt-1 text-sm leading-snug text-muted-foreground">{parts.join(" · ")}</p>
                ) : null;
              })()}
            <CardDetails
              card={parent as unknown as Record<string, unknown>}
              summaryFullWidth
              hideInternalFields
              hideLocation
            />
          </div>
          {!isEditingParent && (
            <div className="flex w-full flex-shrink-0 flex-row items-center justify-end gap-1 sm:w-auto sm:flex-col sm:items-end sm:gap-1">
              <div className="flex items-center gap-1 sm:gap-2">
                {hasChildren && (
                  <div
                    className={cn(
                      "flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-1 text-muted-foreground transition-colors duration-200",
                      hasChildren && !isEditingParent && "group-hover:text-foreground"
                    )}
                  >
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                      {visibleChildren.length}
                    </span>
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    </motion.div>
                  </div>
                )}
                {!readOnly && (
                  <div className="flex gap-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 min-h-9 min-w-9 cursor-pointer rounded-lg p-0 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onStartEditing?.(parent);
                      }}
                      disabled={isWarmingVoice}
                      aria-busy={isWarmingVoice}
                      aria-label={isWarmingVoice ? "Warming voice" : "Edit experience"}
                    >
                      {isWarmingVoice ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <PenLine className="h-4 w-4" aria-hidden />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 min-h-9 min-w-9 cursor-pointer rounded-lg p-0 text-muted-foreground transition-colors duration-200 hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openParentDeleteConfirmation();
                      }}
                      disabled={!parentId || isWarmingVoice}
                      aria-label="Delete experience"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                )}
              </div>
              {isWarmingVoice && (
                <p className="text-[11px] text-muted-foreground tabular-nums leading-none max-w-[9rem] text-right">
                  Warming voice…
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Children - hierarchy/timeline style (thread line + nodes, not inside card) */}
      <AnimatePresence initial={false}>
        {hasChildren && !isEditingParent && isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="relative pl-5 pt-0 sm:pl-7" onClick={(e) => e.stopPropagation()}>
              <span
                className="thread-line thread-line-animated top-0 bottom-4"
                aria-hidden
              />
              <ul className="relative space-y-1">
                {visibleChildren.map((child, childIdx) => {
                  const relationType = (child.child_type ?? "").toString().trim();
                  const relationDisplay = relationType ? relationType.replace(/_/g, " ") : "";

                  return (
                    <motion.li
                      key={child.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: childIdx * 0.06,
                        duration: 0.25,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className={cn(
                        "relative min-w-0 py-2.5 first:pt-3 group/child",
                        deletedId === child.id && "opacity-50"
                      )}
                    >
                      <span
                        className={cn(
                          "thread-node thread-node-sm thread-node-animated",
                          "top-1/2 -translate-y-1/2",
                          editingSavedChildId === child.id && "thread-node-active"
                        )}
                        style={{ animationDelay: `${childIdx * 60 + 100}ms` }}
                        aria-hidden
                      />
                      <div
                        className="ml-4 min-w-0 w-full cursor-pointer rounded-xl border border-border/50 bg-muted/20 px-3 py-3 shadow-sm transition-[box-shadow,background-color,border-color] duration-200 hover:border-border hover:bg-muted/40 hover:shadow-md sm:ml-5 sm:px-4"
                        onClick={() => setViewingChildId(child.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setViewingChildId(child.id);
                          }
                        }}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                          <div className="min-w-0 w-full flex-1">
                            {relationDisplay && (
                              <span className="mb-2 inline-flex max-w-full items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-left text-xs font-medium capitalize leading-none text-primary [overflow-wrap:anywhere]">
                                {relationDisplay}
                              </span>
                            )}
                            <p className="flex flex-col gap-1.5 text-sm font-medium leading-snug text-foreground [overflow-wrap:anywhere]">
                              {(() => {
                                const items = getChildDisplayItems(child);
                                const childType = (child.child_type ?? "").toString().trim().replace(/_/g, " ");
                                if (items.length === 0) return childType || "Detail";
                                return items.map((it, i) => (
                                  <span key={i} className="block">
                                    {it.title && it.summary ? (
                                      <>
                                        {it.title}:{" "}
                                        <span className="font-normal text-muted-foreground">{it.summary}</span>
                                      </>
                                    ) : (
                                      it.title || it.summary
                                    )}
                                  </span>
                                ));
                              })()}
                            </p>
                          </div>
                          {!readOnly && (
                            <div
                              className="flex flex-shrink-0 justify-end gap-0.5 self-end sm:self-start"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-9 w-9 min-h-9 min-w-9 cursor-pointer rounded-lg p-0 text-muted-foreground transition-colors duration-200 hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => openChildDeleteConfirmation(child)}
                                aria-label="Delete detail"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            key={`delete-confirm-${deleteTarget.type}-${deleteTarget.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={closeDeleteConfirmation}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl ring-1 ring-border/40"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-1 w-full bg-gradient-to-r from-primary/80 to-secondary/60" aria-hidden />
              <div className="max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain p-5 sm:max-h-[min(80vh,640px)] sm:p-6">
                <h3 className="font-display text-base font-semibold text-foreground">Delete this card?</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  <span className="font-medium text-foreground">{deleteTarget.label}</span> will be removed permanently.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeDeleteConfirmation}>
                    Cancel
                  </Button>
                  <Button type="button" variant="destructive" onClick={confirmDelete}>
                    Delete
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Child detail modal - pops out when child card is clicked */}
      <AnimatePresence>
        {viewingChildId && (() => {
          const child = visibleChildren.find((c) => c.id === viewingChildId);
          if (!child) return null;
          const relationType = (child.child_type ?? "").toString().trim();
          const relationDisplay = relationType ? relationType.replace(/_/g, " ") : "";

          return (
            <motion.div
              key={`view-child-${viewingChildId}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
              onClick={() => setViewingChildId(null)}
            >
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl ring-1 ring-border/40"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="h-1 w-full shrink-0 bg-gradient-to-r from-primary/80 to-secondary/60" aria-hidden />
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:p-6">
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1">
                      {relationDisplay && (
                        <span className="mb-1 inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium capitalize tracking-normal text-primary">
                          {relationDisplay}
                        </span>
                      )}
                    </div>
                    <div className="flex w-full flex-shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
                      {!readOnly && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setViewingChildId(null);
                            onStartEditingChild?.(child);
                          }}
                          className="min-h-10 gap-1.5"
                        >
                          <PenLine className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-10"
                        onClick={() => setViewingChildId(null)}
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                  <div className="border-t border-border/60">
                    <CardDetails
                      card={child as unknown as Record<string, unknown>}
                      compact={false}
                      summaryFullWidth
                      hideInternalFields
                      hideSummary
                    />
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Edit modal - pops out when pencil is clicked (only in editable mode) */}
      <AnimatePresence>
        {!readOnly &&
          editForm &&
          childEditForm &&
          onEditFormChange &&
          onChildEditFormChange &&
          onCancelEditing &&
          onCancelEditingChild &&
          onSubmitEdit &&
          onSubmitEditChild &&
          (isEditingParent || (editingSavedChildId && visibleChildren.some((c) => c.id === editingSavedChildId))) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                isEditingParent ? onCancelEditing?.() : onCancelEditingChild?.();
              }
            }}
          >
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              aria-hidden
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl ring-1 ring-border/40"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-1 w-full shrink-0 bg-gradient-to-r from-primary/80 to-secondary/60" aria-hidden />
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {isEditingParent ? (
                <ParentCardEditForm
                  form={editForm}
                  onChange={onEditFormChange}
                  onSubmit={onSubmitEdit}
                  onCancel={onCancelEditing}
                  isSubmitting={isSubmitting}
                  checkboxIdPrefix={`edit-saved-${parentId}`}
                  showDeleteButton={false}
                  onUpdateFromMessyText={onUpdateParentFromMessyText}
                  isUpdatingFromMessyText={isUpdatingFromMessyText}
                />
              ) : (
                <ChildCardEditForm
                  form={childEditForm}
                  onChange={onChildEditFormChange}
                  onSubmit={onSubmitEditChild}
                  onCancel={onCancelEditingChild}
                  isSubmitting={isSubmitting}
                  showDeleteButton={false}
                  onUpdateFromMessyText={onUpdateChildFromMessyText}
                  isUpdatingFromMessyText={isUpdatingFromMessyText}
                />
              )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
