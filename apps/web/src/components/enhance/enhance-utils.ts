/**
 * Types and utilities for the enhance card page.
 */
import type {
  ChildValueItem,
  ExperienceCard,
  ExperienceCardChild,
  ExperienceCardChildPatch,
  ExperienceCardPatch,
} from "@/lib/types";
import type { ParentCardForm } from "@/hooks/use-card-forms";

export type CommitDraftChildPayload = {
  id: string | null;
  child_type: string;
  items: unknown[];
};

export type FillFromTextResponse = {
  filled?: Record<string, unknown>;
};

export type ChildForm = {
  title: string;
  summary: string;
  items: ChildValueItem[];
};

const PARENT_FORM_KEYS = new Set([
  "title", "summary", "normalized_role", "domain", "sub_domain", "company_name", "company_type",
  "location", "employment_type", "start_date", "end_date", "is_current", "intent_primary",
  "intent_secondary_str", "seniority_level", "confidence_score", "experience_card_visibility",
]);

export function normalizeChildItem(item: ChildValueItem | Record<string, unknown>): ChildValueItem {
  const raw = item as Record<string, unknown>;
  return {
    subtitle: String(raw.subtitle ?? raw.title ?? "").trim(),
    sub_summary: (raw.sub_summary ?? raw.description ?? null) as string | null,
  };
}

export function parentFormToPatch(form: {
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

export function mergeParentForPreview(
  parent: ExperienceCard,
  form: ParentCardForm,
  rawText: string
): ExperienceCard {
  const patch = parentFormToPatch(form);
  return {
    ...parent,
    ...patch,
    raw_text: (rawText.trim() || parent.raw_text) ?? null,
    intent_secondary: patch.intent_secondary ?? parent.intent_secondary,
    experience_card_visibility:
      patch.experience_card_visibility ?? parent.experience_card_visibility,
  };
}

export function childToForm(child: ExperienceCardChild): ChildForm {
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

export function childFormToPatch(form: ChildForm): ExperienceCardChildPatch {
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

export function mergeChildForPreview(
  child: ExperienceCardChild,
  form: ChildForm | undefined
): ExperienceCardChild {
  if (!form) return child;
  const patch = childFormToPatch(form);
  return {
    ...child,
    items: patch.items ?? child.items,
  };
}

export function syntheticPreviewChild(childType: string, form: ChildForm): ExperienceCardChild {
  const patch = childFormToPatch(form);
  return {
    id: `__draft__${childType}`,
    child_type: childType,
    items: patch.items ?? [],
  };
}

export function getParentId(parent: ExperienceCard | Record<string, unknown>): string {
  const p = parent as Record<string, unknown>;
  return String(p.id ?? p.card_id ?? "").trim();
}

export function applyFilledToParentFormOverwrite(filled: Record<string, unknown>): Record<string, unknown> {
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

export function buildAiQuestions(card: ExperienceCard): string[] {
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

export function buildCommitDraftPayload(
  editForm: ParentCardForm,
  parentRawText: string,
  serverChildren: ExperienceCardChild[],
  childForms: Record<string, ChildForm>,
  extraChildFormsByType: Record<string, ChildForm>
): { parent: ExperienceCardPatch; children: CommitDraftChildPayload[] } {
  const parent: ExperienceCardPatch = {
    ...parentFormToPatch(editForm),
    raw_text: parentRawText.trim() || null,
  };
  const children: CommitDraftChildPayload[] = [];
  for (const c of serverChildren) {
    if (!c.id) continue;
    const form = childForms[c.id];
    const patch = childFormToPatch(form ?? childToForm(c));
    children.push({
      id: c.id,
      child_type: c.child_type,
      items: (patch.items ?? []) as unknown[],
    });
  }
  for (const [ct, form] of Object.entries(extraChildFormsByType)) {
    const patch = childFormToPatch(form);
    if (!patch.items?.length) continue;
    children.push({ id: null, child_type: ct, items: (patch.items ?? []) as unknown[] });
  }
  return { parent, children };
}
