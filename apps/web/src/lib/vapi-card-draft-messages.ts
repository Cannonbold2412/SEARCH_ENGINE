/**
 * Parse Vapi Web SDK `message` events for client-side tool `update_card_draft`.
 * Shapes differ by dashboard version; we accept several variants.
 */

import type { CardDraftPatch, PatchChildItem, PatchListKey } from "@/lib/apply-card-draft-patch";

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function splitLabelAndDetail(text: string): { label: string; detail: string } | null {
  const match = text.match(/^([^:]{1,80}):\s+(.+)$/);
  if (!match) return null;
  const label = match[1]?.trim() ?? "";
  const detail = match[2]?.trim() ?? "";
  if (!label || !detail) return null;
  return { label, detail };
}

function coercePatch(raw: unknown): CardDraftPatch | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const strArr = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    return v.map((x) => String(x));
  };
  const patch: CardDraftPatch = {};

  // Legacy payload shape (older dashboard versions)
  if (typeof o.summary === "string") patch.summary = o.summary;
  if (typeof o.notes === "string") patch.notes = o.notes;
  const rk = strArr(o.responsibilities_add);
  if (rk) patch.responsibilities_add = rk;
  const sk = strArr(o.strengths_add);
  if (sk) patch.strengths_add = sk;
  const ok = strArr(o.outcomes_add);
  if (ok) patch.outcomes_add = ok;
  const pk = strArr(o.proof_points_add);
  if (pk) patch.proof_points_add = pk;
  const tk = strArr(o.tools_add);
  if (tk) patch.tools_add = tk;

  // New payload shape (schema uses parent_patch + child_updates)
  // The dashboard can send items as `{ subtitle, description }` objects.
  // Our local draft state currently supports additive lists only, so we map
  // `child_updates[].items[].description` -> the legacy *_add string arrays.
  const parentPatch = o.parent_patch as Record<string, unknown> | undefined;
  if (parentPatch && !patch.summary) {
    const sum = parentPatch.summary;
    const sumText =
      typeof sum === "string"
        ? sum
        : sum && typeof sum === "object" && "text" in (sum as Record<string, unknown>)
          ? String((sum as Record<string, unknown>).text)
          : null;

    if (sumText && sumText.trim()) patch.summary = sumText.trim();
  }

  if (typeof o.notes === "string" && !patch.notes) {
    patch.notes = o.notes;
  }

  const childUpdates = o.child_updates as unknown[] | undefined;
  if (Array.isArray(childUpdates)) {
    const mapChildTypeToPatchKey: Record<string, PatchListKey> = {
      responsibilities: "responsibilities_add",
      responsibility: "responsibilities_add",
      skills: "strengths_add",
      skills_add: "strengths_add",
      tools: "tools_add",
      metrics: "outcomes_add",
      metric: "outcomes_add",
      achievements: "proof_points_add",
      achievement: "proof_points_add",
      collaborations: "collaborations_add",
      collaboration: "collaborations_add",
      domain_knowledge: "domain_knowledge_add",
      exposure: "exposure_add",
      education: "education_add",
      certifications: "certifications_add",
    };

    for (const u of childUpdates) {
      if (!u || typeof u !== "object") continue;
      const upd = u as Record<string, unknown>;
      const rawChildType = String(upd.child_type ?? "").trim();
      if (!rawChildType) continue;
      const childType = rawChildType.toLowerCase().replace(/\s+/g, "_");

      const operationRaw = String(upd.operation ?? "").trim().toLowerCase();
      const operation =
        operationRaw ||
        // If dashboard omits operation, assume additive.
        "append_items";
      // Our local applier only truly understands additive updates today.
      // Treat `append_items` and `merge_items` as additive; `replace_items`
      // is approximated as additive to at least surface details.
      if (
        operation !== "append_items" &&
        operation !== "merge_items" &&
        operation !== "replace_items" &&
        operation !== "append" &&
        operation !== "merge" &&
        operation !== "replace" &&
        operation !== "append_item" &&
        operation !== "merge_item" &&
        operation !== "replace_item" &&
        operation !== "add_items" &&
        operation !== "add" &&
        operation !== "upsert_items" &&
        operation !== "upsert"
      ) {
        continue;
      }

      const patchKey = mapChildTypeToPatchKey[childType];
      if (!patchKey) continue;

      const items = upd.items as unknown[] | undefined;
      if (!Array.isArray(items) || items.length === 0) continue;

      const lines: string[] = [];
      const structuredItems: PatchChildItem[] = [];
      for (const it of items) {
        if (!it || typeof it !== "object") continue;
        const item = it as Record<string, unknown>;
        const desc = item.description;
        const subtitle = item.subtitle;
        const subSummary = item.sub_summary;
        const title = item.title ?? item.name ?? item.value ?? item.text ?? item.raw_text;

        const lineCandidate =
          typeof desc === "string"
            ? desc
            : typeof subtitle === "string"
              ? subtitle
              : typeof subSummary === "string"
                ? subSummary
                : typeof title === "string"
                  ? title
                  : null;

        const line = (lineCandidate ?? "").trim();
        if (!line) continue;
        lines.push(line);

        const normalizedSubtitle = typeof subtitle === "string" ? subtitle.trim() : "";
        const normalizedDescription = typeof desc === "string" ? desc.trim() : "";
        const parsedFromDescription =
          !normalizedSubtitle && normalizedDescription
            ? splitLabelAndDetail(normalizedDescription)
            : null;
        const finalSubtitle =
          normalizedSubtitle ||
          parsedFromDescription?.label ||
          normalizedDescription;
        let finalSubSummary =
          normalizedSubtitle
            ? normalizedDescription || null
            : parsedFromDescription?.detail ?? null;
        if (
          finalSubtitle &&
          finalSubSummary &&
          finalSubtitle.toLowerCase() === finalSubSummary.toLowerCase()
        ) {
          finalSubSummary = null;
        }

        if (finalSubtitle || finalSubSummary) {
          structuredItems.push({
            subtitle: finalSubtitle || finalSubSummary || "",
            sub_summary: finalSubSummary,
          });
        }
      }

      if (lines.length === 0) continue;
      const existing = patch[patchKey] as string[] | undefined;
      patch[patchKey] = Array.isArray(existing) ? [...existing, ...lines] : lines;

      if (structuredItems.length > 0) {
        const existingStructured = patch.child_items_add?.[patchKey] ?? [];
        patch.child_items_add = {
          ...(patch.child_items_add ?? {}),
          [patchKey]: [...existingStructured, ...structuredItems],
        };
      }
    }
  }

  if (Object.keys(patch).length === 0) return null;
  return patch;
}

function parseArgs(args: unknown): CardDraftPatch | null {
  if (typeof args === "string") {
    const p = tryParseJson(args);
    return coercePatch(p);
  }
  if (args && typeof args === "object") return coercePatch(args);
  return null;
}

function parseUpdateCardDraftFromText(text: string): CardDraftPatch | null {
  const s = String(text ?? "");
  if (!s.trim()) return null;

  // Avoid expensive parsing if the payload clearly isn't present.
  const hasParentPatch = s.includes("parent_patch");
  const hasChildUpdates = s.includes("child_updates");
  if (!hasParentPatch && !hasChildUpdates) return null;

  // Try direct JSON first.
  const direct = tryParseJson(s);
  const directPatch = coercePatch(direct);
  if (directPatch) return directPatch;

  // Dashboard variants sometimes embed JSON inside other text; extract the outer object.
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;

  const embedded = s.slice(firstBrace, lastBrace + 1);
  const parsed = tryParseJson(embedded);
  return coercePatch(parsed);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

/**
 * Find the first nested object that looks like an `update_card_draft` payload.
 * We only search for structural keys (not values) to keep this lightweight.
 */
function findPatchLikeObject(root: unknown, maxDepth = 4): Record<string, unknown> | null {
  function walk(node: unknown, depth: number): Record<string, unknown> | null {
    if (depth > maxDepth) return null;

    if (isRecord(node)) {
      const hasParent = Object.prototype.hasOwnProperty.call(node, "parent_patch");
      const hasChild = Object.prototype.hasOwnProperty.call(node, "child_updates");
      if (hasParent && hasChild) return node;

      for (const v of Object.values(node)) {
        const found = walk(v, depth + 1);
        if (found) return found;
      }
      return null;
    }

    if (Array.isArray(node)) {
      for (const v of node) {
        const found = walk(v, depth + 1);
        if (found) return found;
      }
    }

    return null;
  }

  return walk(root, 0);
}

function collectCandidateStrings(root: unknown, maxDepth = 4): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  function walk(node: unknown, depth: number, path: string) {
    if (depth > maxDepth) return;

    if (typeof node === "string") {
      const t = node.trim();
      if (!t) return;
      // Cheap prefilter: only keep strings that mention the schema keys.
      if (t.includes("parent_patch") || t.includes("child_updates") || t.includes('"operation"')) {
        out.push({ path, text: t });
      }
      return;
    }

    if (isRecord(node)) {
      for (const [k, v] of Object.entries(node)) {
        walk(v, depth + 1, path ? `${path}.${k}` : k);
      }
      return;
    }

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        walk(node[i], depth + 1, `${path}[${i}]`);
      }
      return;
    }
  }
  walk(root, 0, "");
  return out;
}

/**
 * If this message is an `update_card_draft` tool invocation, return its payload; else null.
 */
export function extractUpdateCardDraftPatch(msg: unknown): CardDraftPatch | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;
  const t = String(m.type ?? "").toLowerCase().replace(/-/g, "_");

  if (t === "tool_calls" || t === "toolcalls") {
    const calls = (m.toolCalls ?? m.tool_calls ?? m.toolCallList) as unknown[] | undefined;
    for (const c of calls ?? []) {
      if (!c || typeof c !== "object") continue;
      const co = c as Record<string, unknown>;
      const fn = (co.function as Record<string, unknown>) || co;
      const name = String(fn.name ?? co.name ?? "").toLowerCase();
      if (name !== "update_card_draft") continue;
      const parsed = parseArgs(fn.arguments ?? co.arguments);
      if (parsed) return parsed;
    }
  }

  if (t === "function_call" || t === "functioncall") {
    const name = String(m.functionName ?? m.name ?? "").toLowerCase();
    if (name === "update_card_draft") {
      return parseArgs(m.arguments ?? m.parameters ?? m.args);
    }
  }

  const directName = String(m.name ?? "").toLowerCase();
  if (directName === "update_card_draft") {
    const parsed = parseArgs(m.arguments ?? m.parameters ?? m.args ?? m.body);
    if (parsed) return parsed;
  }

  const fc = m.functionCall as Record<string, unknown> | undefined;
  if (fc && String(fc.name ?? "").toLowerCase() === "update_card_draft") {
    return parseArgs(fc.arguments);
  }

  // Some Vapi dashboard versions emit the tool payload as plain JSON inside a normal message,
  // rather than using `tool_calls`. As a fallback, attempt to parse from common text fields
  // and from top-level objects.
  try {
    // When the raw message includes patch keys but not as a tool call, we may need
    // to locate a nested object containing { parent_patch, child_updates }.
    const nestedCandidate = findPatchLikeObject(m, 4);
    const hasParentPatchTop = Object.prototype.hasOwnProperty.call(m, "parent_patch");
    const hasChildUpdatesTop = Object.prototype.hasOwnProperty.call(m, "child_updates");

    // 1) Scan any string leaf that mentions the schema keys.
    const candidateStrings = collectCandidateStrings(m, 4);
    for (const c of candidateStrings.slice(0, 6)) {
      const hasParentPatch = c.text.includes("parent_patch");
      const hasChildUpdates = c.text.includes("child_updates");
      if (!hasParentPatch && !hasChildUpdates) continue;

      const patch = parseUpdateCardDraftFromText(c.text);
      if (patch) {
        return patch;
      }
    }

    const candidateFields: Array<[string, unknown]> = [
      ["content", m.content],
      ["message", m.message],
      ["text", m.text],
      ["transcript", m.transcript],
    ];

    for (const [field, val] of candidateFields) {
      if (typeof val !== "string") continue;
      const hasParentPatch = val.includes("parent_patch");
      const hasChildUpdates = val.includes("child_updates");
      if (!hasParentPatch && !hasChildUpdates) continue;

      const patch = parseUpdateCardDraftFromText(val);
      if (patch) {
        return patch;
      }
    }

    // If the payload is already shaped like `{ parent_patch, child_updates, ... }`, try coercion directly.
    const patchFromNested = nestedCandidate ? coercePatch(nestedCandidate) : null;
    const topPatch = coercePatch(m);
    const patch = patchFromNested ?? topPatch;
    if (patch) {
      return patch;
    }
  } catch {
    // ignore
  }

  return null;
}
