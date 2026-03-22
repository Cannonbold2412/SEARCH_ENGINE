"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  CardDetails,
  displayCardTitle,
  getChildDisplayItems,
  getLocationFromCard,
  isPlaceholderChildCard,
} from "../card/card-details";
import { PenLine, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExperienceCard, ExperienceCardChild } from "@/types";

export interface ExperienceFamilyCardPreviewProps {
  parent: ExperienceCard;
  children: ExperienceCardChild[];
  deletedId?: string | null;
  /** Match Your Cards: thread starts collapsed unless true */
  defaultExpanded?: boolean;
  onParentPenClick?: () => void;
  onChildPenClick?: (child: ExperienceCardChild) => void;
  /** Read-only mirror (no pencils) */
  hideActions?: boolean;
}

/**
 * Same visual layout as {@link SavedCardFamily} on Your Cards (parent card + thread + children),
 * without delete actions or navigation to /enhance — for live preview on the enhance page.
 */
export function ExperienceFamilyCardPreview({
  parent,
  children,
  deletedId = null,
  defaultExpanded = false,
  onParentPenClick,
  onChildPenClick,
  hideActions = false,
}: ExperienceFamilyCardPreviewProps) {
  const parentId = String(
    (parent as { id?: string })?.id ?? (parent as Record<string, unknown>)?.card_id ?? ""
  ).trim();
  const visibleChildren = children.filter((c) => !isPlaceholderChildCard(c as Record<string, unknown>));
  const hasChildren = visibleChildren.length > 0;
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [viewingChildId, setViewingChildId] = useState<string | null>(null);

  const handleParentClick = () => {
    if (!hasChildren) return;
    setIsExpanded((prev) => !prev);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className={cn("relative", deletedId === parentId && "opacity-50")}
    >
      <div
        className={cn(
          "group rounded-xl border border-border/60 bg-card p-4 transition-colors",
          hasChildren && "cursor-pointer hover:bg-accent/30"
        )}
        onClick={handleParentClick}
        onKeyDown={(e) => {
          if (hasChildren && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
        role={hasChildren ? "button" : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-[16px] text-foreground leading-snug">
              {displayCardTitle(parent.title, parent.company_name || "Untitled")}
            </h3>
            {(() => {
              const company =
                parent.company_name &&
                displayCardTitle(parent.title, parent.company_name || "") !== parent.company_name.trim()
                  ? parent.company_name
                  : null;
              const location = getLocationFromCard(parent);
              const parts = [company, location].filter(Boolean);
              return parts.length > 0 ? (
                <p className="text-sm text-[rgba(237,237,237,0.6)] leading-[15px] mt-0.5">{parts.join(" · ")}</p>
              ) : null;
            })()}
            <CardDetails
              card={parent as unknown as Record<string, unknown>}
              summaryFullWidth
              hideInternalFields
              hideLocation
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasChildren && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground tabular-nums">{visibleChildren.length}</span>
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-muted-foreground"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </motion.div>
              </div>
            )}
            {!hideActions && onParentPenClick && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground h-7 w-7 p-0"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onParentPenClick();
                  }}
                  aria-label="Edit experience"
                >
                  <PenLine className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="relative pl-7 pt-0" onClick={(e) => e.stopPropagation()}>
              <span className="thread-line thread-line-animated top-0 bottom-4" aria-hidden />
              <ul className="relative space-y-0">
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
                        "relative py-2.5 first:pt-3 group/child",
                        deletedId === child.id && "opacity-50"
                      )}
                    >
                      <span
                        className={cn(
                          "thread-node thread-node-sm thread-node-animated",
                          "top-1/2 -translate-y-1/2"
                        )}
                        style={{ animationDelay: `${childIdx * 60 + 100}ms` }}
                        aria-hidden
                      />
                      <div
                        className="ml-5 rounded-lg border border-border/60 bg-accent/30 px-3 py-2.5 transition-colors hover:bg-accent/50 cursor-pointer"
                        onClick={() => setViewingChildId(child.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {relationDisplay && (
                              <span className="inline-block text-sm text-left align-bottom text-foreground/60 font-medium leading-snug mb-1 tracking-normal uppercase">
                                {relationDisplay}
                              </span>
                            )}
                            <p className="flex flex-wrap text-sm font-medium text-foreground leading-snug px-2.5 whitespace-pre-line">
                              {(() => {
                                const items = getChildDisplayItems(child);
                                const childType = (child.child_type ?? "").toString().trim().replace(/_/g, " ");
                                if (items.length === 0) return childType || "Detail";
                                return items.map((it, i) => (
                                  <span key={i}>
                                    {it.title && it.summary ? (
                                      <>
                                        {it.title}:{" "}
                                        <span style={{ color: "rgba(128, 128, 128, 0.6)" }}>{it.summary}</span>
                                      </>
                                    ) : (
                                      it.title || it.summary
                                    )}
                                    {i < items.length - 1 && "\n"}
                                  </span>
                                ));
                              })()}
                            </p>
                          </div>
                          {!hideActions && onChildPenClick && (
                            <div className="flex gap-0.5 flex-shrink-0 opacity-0 group-hover/child:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground hover:text-foreground h-6 w-6 p-0"
                                onClick={() => onChildPenClick(child)}
                                aria-label="Edit detail"
                              >
                                <PenLine className="h-3 w-3" />
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
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={() => setViewingChildId(null)}
            >
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border/60 bg-card shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="py-[10px] px-[15px] sm:p-6">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0 flex-1">
                      {relationDisplay && (
                        <span className="inline-block text-[16px] uppercase tracking-wider text-primary/60 font-medium mb-0.5">
                          {relationDisplay}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {!hideActions && onChildPenClick && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setViewingChildId(null);
                            onChildPenClick(child);
                          }}
                          className="gap-1.5"
                        >
                          <PenLine className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setViewingChildId(null)}>
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
    </motion.div>
  );
}
