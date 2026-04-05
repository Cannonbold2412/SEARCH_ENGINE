/**
 * Vapi Web SDK transcript parsing and streaming bubble upserts (shared with builder chat).
 */

import type { MutableRefObject } from "react";

export type TranscriptRole = "assistant" | "user";

export type TranscriptChatMessage = {
  id: string;
  role: TranscriptRole;
  content: string;
};

/** Strip outer punctuation only; keep letters/numbers from any script (not ASCII \\w). */
function normalizedTokenForDedupe(token: string): string {
  const t = token.normalize("NFC").toLowerCase();
  const stripped = t.replace(/^[\p{M}\p{P}\p{S}\p{Z}]+|[\p{M}\p{P}\p{S}\p{Z}]+$/gu, "");
  if (stripped.length > 0) return stripped;
  return `\uE000${t}`;
}

function collapseAdjacentDuplicatePhrases(text: string): string {
  const tokens = text
    .trim()
    .split(/[\s\u3000]+/)
    .filter(Boolean);
  if (tokens.length < 2) return text.trim();

  const normalized = (token: string) => normalizedTokenForDedupe(token);
  const maxWindow = Math.min(12, Math.floor(tokens.length / 2));
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < tokens.length - 1; i++) {
      let removed = false;
      for (let size = maxWindow; size >= 1; size--) {
        if (i + size * 2 > tokens.length) continue;
        let equal = true;
        for (let j = 0; j < size; j++) {
          if (normalized(tokens[i + j]) !== normalized(tokens[i + size + j])) {
            equal = false;
            break;
          }
        }
        if (!equal) continue;
        tokens.splice(i + size, size);
        changed = true;
        removed = true;
        break;
      }
      if (removed) break;
    }
  }

  return tokens.join(" ").trim();
}

function mergeTranscriptText(oldText: string, nextText: string): string {
  const oldEndsWithSpace = /\s$/.test(oldText);
  const nextStartsWithSpace = /^\s/.test(nextText);
  if (oldText.length === 0) return collapseAdjacentDuplicatePhrases(nextText);
  const merged = oldEndsWithSpace || nextStartsWithSpace ? oldText + nextText : oldText + " " + nextText;
  return collapseAdjacentDuplicatePhrases(merged);
}

/**
 * Combine streaming partials: supports cumulative snapshots (each chunk extends the prior)
 * and incremental deltas (chunk is only new words). Safe for multilingual text.
 */
export function mergePartialTranscriptChunk(priorDisplay: string, incoming: string): string {
  const p = priorDisplay.trimEnd();
  const n = incoming.trim();
  if (!n) return priorDisplay;
  if (!p) return collapseAdjacentDuplicatePhrases(n);
  const pTrim = p.trim();
  const nTrim = n.trim();
  if (n.startsWith(p) || n.startsWith(pTrim)) return collapseAdjacentDuplicatePhrases(n);
  if (p.startsWith(nTrim) && nTrim.length <= pTrim.length) return collapseAdjacentDuplicatePhrases(p);
  if (p.endsWith(n) || p.endsWith(nTrim)) return collapseAdjacentDuplicatePhrases(p);
  return mergeTranscriptText(p, n);
}

/**
 * Whether this Vapi/STT payload should be merged as an interim update (vs committing the bubble).
 */
export function isTranscriptPartial(m: Record<string, unknown>): boolean {
  if (m.is_final === true || m.isFinal === true) return false;
  const t = String(m.transcriptType ?? m.transcript_type ?? "").toLowerCase();
  if (t === "final" || t === "complete" || t === "done") return false;
  if (t === "partial" || t === "interim" || t === "streaming") return true;
  // Some multilingual streams omit transcriptType on interim results — merge instead of finalizing.
  return t.length === 0;
}

/** Extract speakable text from a Vapi `message` event payload. */
export function extractTranscriptText(m: Record<string, unknown>): string {
  let rawText: string | undefined;
  const transcriptAny = m.transcript as unknown;

  const assignIfString = (candidate: unknown): boolean => {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      rawText = candidate;
      return true;
    }
    return false;
  };

  const scanArray = (arr: unknown): boolean => {
    if (!Array.isArray(arr)) return false;
    for (const item of arr) {
      if (assignIfString(item)) return true;
      if (item && typeof item === "object") {
        const typed = item as Record<string, unknown>;
        if (assignIfString(typed.text)) return true;
        if (assignIfString(typed.transcript)) return true;
      }
    }
    return false;
  };

  if (!assignIfString(m.transcript) && transcriptAny && typeof transcriptAny === "object") {
    const transcriptObj = transcriptAny as Record<string, unknown>;
    assignIfString(transcriptObj.text) ||
      assignIfString(transcriptObj.transcript) ||
      assignIfString(transcriptObj.value) ||
      scanArray(transcriptObj.chunks) ||
      scanArray(transcriptObj.segments) ||
      scanArray(transcriptObj.alternatives);
  }

  if (!rawText) {
    const alternatives = m.alternatives as unknown;
    assignIfString(m.content) ||
      assignIfString(m.text) ||
      (Array.isArray(alternatives)
        ? assignIfString((alternatives[0] as Record<string, unknown> | undefined)?.text)
        : false);
  }

  return collapseAdjacentDuplicatePhrases(String(rawText ?? ""));
}

/**
 * Merge streaming transcript chunks into one bubble per spoken turn.
 * Partials use cumulative/incremental-safe merging; finals append to committed text.
 */
export function upsertStreamingTranscriptMessage<T extends TranscriptChatMessage>(
  prev: T[],
  role: TranscriptRole,
  text: string,
  isPartial: boolean,
  activeIdRef: MutableRefObject<string | null>,
  committedTextRef: MutableRefObject<string>
): T[] {
  const activeId = activeIdRef.current;
  const activeMessage = activeId ? prev.find((msg) => msg.id === activeId) : undefined;

  if (activeId && activeMessage) {
    let newContent: string;
    if (isPartial) {
      const displaySoFar = String(activeMessage.content ?? "");
      newContent = mergePartialTranscriptChunk(displaySoFar, text);
    } else {
      committedTextRef.current = committedTextRef.current
        ? mergeTranscriptText(committedTextRef.current, text)
        : text;
      newContent = committedTextRef.current;
    }
    return prev.map((msg) => (msg.id === activeId ? { ...msg, content: newContent } : msg)) as T[];
  }

  const newId = `${Date.now()}-${prev.length}`;
  activeIdRef.current = newId;
  committedTextRef.current = isPartial ? "" : text;
  return [...prev, { id: newId, role, content: text } as T];
}

/** Clear streaming state so the next utterance starts a new bubble. */
export function resetTranscriptStreamRefs(refs: {
  activeAssistantId: MutableRefObject<string | null>;
  committedAssistant: MutableRefObject<string>;
  activeUserId: MutableRefObject<string | null>;
  committedUser: MutableRefObject<string>;
}): void {
  refs.activeAssistantId.current = null;
  refs.committedAssistant.current = "";
  refs.activeUserId.current = null;
  refs.committedUser.current = "";
}
