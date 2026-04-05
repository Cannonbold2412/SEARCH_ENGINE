/**
 * Client-side merge for Vapi `update_card_draft` tool — additive, deduped, no DB.
 */

import type { ParentCardForm } from "@/hooks/use-card-forms";
import type { ChildValueItem } from "@/lib/types";

export type PatchChildItem = {
  subtitle: string;
  sub_summary?: string | null;
};

export type PatchListKey =
  | "responsibilities_add"
  | "strengths_add"
  | "outcomes_add"
  | "proof_points_add"
  | "tools_add"
  | "collaborations_add"
  | "domain_knowledge_add"
  | "exposure_add"
  | "education_add"
  | "certifications_add";

export type CardDraftPatch = {
  summary?: string;
  responsibilities_add?: string[];
  strengths_add?: string[];
  outcomes_add?: string[];
  proof_points_add?: string[];
  tools_add?: string[];
  collaborations_add?: string[];
  domain_knowledge_add?: string[];
  exposure_add?: string[];
  education_add?: string[];
  certifications_add?: string[];
  child_items_add?: Partial<Record<PatchListKey, PatchChildItem[]>>;
  notes?: string;
};

/** Maps patch list keys to backend `child_type` (see domain ALLOWED_CHILD_TYPES). */
export const PATCH_LIST_KEYS = [
  ["responsibilities_add", "responsibilities"],
  ["strengths_add", "skills"],
  ["outcomes_add", "metrics"],
  ["proof_points_add", "achievements"],
  ["tools_add", "tools"],
  ["collaborations_add", "collaborations"],
  ["domain_knowledge_add", "domain_knowledge"],
  ["exposure_add", "exposure"],
  ["education_add", "education"],
  ["certifications_add", "certifications"],
] as const;

export type ChildForm = {
  title: string;
  summary: string;
  items: ChildValueItem[];
};

export type EnhanceDraftState = {
  parentForm: ParentCardForm;
  parentRawText: string;
  childForms: Record<string, ChildForm>;
  /** Dimension types not yet persisted (no row id). */
  extraChildFormsByType: Record<string, ChildForm>;
};

function normLine(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function dedupeLines(add: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of add) {
    const n = normLine(a);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

function normalizePatchChildItem(raw: PatchChildItem): PatchChildItem | null {
  const subtitle = normLine(String(raw.subtitle ?? ""));
  const subSummary = normLine(String(raw.sub_summary ?? ""));
  if (!subtitle && !subSummary) return null;
  return {
    subtitle: subtitle || subSummary,
    sub_summary: subSummary || null,
  };
}

function dedupePatchChildItems(add: PatchChildItem[]): PatchChildItem[] {
  const seen = new Set<string>();
  const out: PatchChildItem[] = [];
  for (const raw of add) {
    const item = normalizePatchChildItem(raw);
    if (!item) continue;
    const key = `${item.subtitle.toLowerCase()}|${String(item.sub_summary ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function appendItemsDeduped(
  form: ChildForm | undefined,
  lines: string[],
  structuredItems: PatchChildItem[] = []
): ChildForm {
  const base: ChildForm = form ?? { title: "", summary: "", items: [] };
  const items = [...(base.items ?? [])];

  const seen = new Set(
    items
      .map((it) => {
        const subtitle = normLine(String(it.subtitle ?? "")).toLowerCase();
        const subSummary = normLine(String(it.sub_summary ?? "")).toLowerCase();
        return subtitle ? `${subtitle}|${subSummary}` : "";
      })
      .filter(Boolean)
  );

  for (const item of dedupePatchChildItems(structuredItems)) {
    const key = `${item.subtitle.toLowerCase()}|${String(item.sub_summary ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ subtitle: item.subtitle, sub_summary: item.sub_summary ?? null });
  }

  for (const line of lines) {
    const n = normLine(line);
    if (!n) continue;
    const key = `${n.toLowerCase()}|`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ subtitle: n, sub_summary: null });
  }
  return { ...base, items };
}

/** Map child_type -> child id for rows already on the server. */
export function childTypeToIdMap(serverChildren: { id: string; child_type: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of serverChildren) {
    const ct = (c.child_type ?? "").trim();
    if (ct && c.id) m.set(ct, c.id);
  }
  return m;
}

/**
 * Apply one `update_card_draft` payload into draft state (immutable).
 */
export function applyCardDraftPatch(
  draft: EnhanceDraftState,
  patch: CardDraftPatch,
  childTypeToId: Map<string, string>
): EnhanceDraftState {
  let parentForm = { ...draft.parentForm };
  let parentRawText = draft.parentRawText;

  if (patch.summary != null && String(patch.summary).trim()) {
    parentForm = { ...parentForm, summary: String(patch.summary).trim() };
  }

  if (patch.notes != null && String(patch.notes).trim()) {
    const note = String(patch.notes).trim();
    parentRawText = draft.parentRawText.trim()
      ? `${draft.parentRawText.trim()}\n${note}`
      : note;
  }

  let childForms = { ...draft.childForms };
  let extraChildFormsByType = { ...draft.extraChildFormsByType };

  for (const [patchKey, childType] of PATCH_LIST_KEYS) {
    const structuredRaw = patch.child_items_add?.[patchKey];
    const structuredItems = Array.isArray(structuredRaw) ? structuredRaw : [];

    const raw = patch[patchKey];
    const lines =
      structuredItems.length > 0
        ? []
        : Array.isArray(raw)
          ? dedupeLines(raw.map((x) => String(x)))
          : [];
    if (structuredItems.length === 0 && lines.length === 0) continue;

    const idForType = childTypeToId.get(childType);
    if (idForType) {
      const prev = childForms[idForType] ?? draft.childForms[idForType];
      childForms = { ...childForms, [idForType]: appendItemsDeduped(prev, lines, structuredItems) };
    } else {
      const prev = extraChildFormsByType[childType];
      extraChildFormsByType = {
        ...extraChildFormsByType,
        [childType]: appendItemsDeduped(prev, lines, structuredItems),
      };
    }
  }

  return {
    parentForm,
    parentRawText,
    childForms,
    extraChildFormsByType,
  };
}
