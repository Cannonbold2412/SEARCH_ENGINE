import type { ExperienceCard, ExperienceCardChild } from "@/lib/types";

export function toText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

const GENERIC_CARD_TITLES = new Set([
  "experience",
  "tools experience",
  "tools",
  "tools detail",
  "general experience",
  "unspecified experience",
]);

export function displayCardTitle(title: string | null | undefined, fallback = "Untitled"): string {
  const t = (title ?? "").trim().toLowerCase();
  if (!t || GENERIC_CARD_TITLES.has(t)) return fallback;
  return (title ?? "").trim();
}

function getFirstItemTitle(first: Record<string, unknown> | undefined): string {
  if (!first || typeof first !== "object") return "";
  return (first.subtitle ?? first.title ?? "").toString().trim();
}

function getFirstItemSummary(first: Record<string, unknown> | undefined): string {
  if (!first || typeof first !== "object") return "";
  return (first.sub_summary ?? first.description ?? "").toString().trim();
}

export function getChildDisplayTitle(child: ExperienceCardChild | Record<string, unknown>): string {
  const c = child as Record<string, unknown>;
  const items = c.items as Record<string, unknown>[] | undefined;
  const first = items?.[0];
  const title = getFirstItemTitle(first);
  if (title) return title;
  return (c.child_type as string) || "";
}

export function getChildDisplayTitlesAll(child: ExperienceCardChild | Record<string, unknown>): string {
  const c = child as Record<string, unknown>;
  const items = (c.items as Record<string, unknown>[] | undefined) ?? [];
  const titles = items.map((it) => getFirstItemTitle(it)).filter(Boolean);
  return titles.join("\n") || (c.child_type as string) || "";
}

export function getChildDisplayTitlesWithDescriptions(
  child: ExperienceCardChild | Record<string, unknown>
): string {
  const c = child as Record<string, unknown>;
  const items = (c.items as Record<string, unknown>[] | undefined) ?? [];
  const lines = items
    .map((it) => {
      const title = getFirstItemTitle(it);
      const summary = getFirstItemSummary(it);
      if (title && summary) return `${title}: ${summary}`;
      if (title) return title;
      if (summary) return summary;
      return "";
    })
    .filter(Boolean);
  return lines.join("\n") || (c.child_type as string) || "";
}

export function getChildDisplayItems(
  child: ExperienceCardChild | Record<string, unknown>
): { title: string; summary: string }[] {
  const c = child as Record<string, unknown>;
  const items = (c.items as Record<string, unknown>[] | undefined) ?? [];
  return items
    .map((it) => ({
      title: getFirstItemTitle(it),
      summary: getFirstItemSummary(it),
    }))
    .filter((pair) => pair.title || pair.summary);
}

export function getChildDisplaySummary(child: ExperienceCardChild | Record<string, unknown>): string {
  const c = child as Record<string, unknown>;
  const items = c.items as Record<string, unknown>[] | undefined;
  const first = items?.[0];
  return getFirstItemSummary(first);
}

export function isPlaceholderChildCard(child: ExperienceCardChild | Record<string, unknown>): boolean {
  const title = getChildDisplayTitle(child);
  const summary = getChildDisplaySummary(child);
  const items = (child as Record<string, unknown>).items as Record<string, unknown>[] | undefined;
  const hasItems = Array.isArray(items) && items.some((it) => getFirstItemTitle(it) || getFirstItemSummary(it));
  return !title && !summary && !hasItems;
}

export function getLocationFromCard(
  card: ExperienceCard | ExperienceCardChild | Record<string, unknown>
): string | null {
  const cardAny = card as Record<string, unknown>;
  const locationValue = cardAny.location;
  const locationObj =
    locationValue && typeof locationValue === "object"
      ? (locationValue as { text?: unknown; city?: unknown; region?: unknown; country?: unknown })
      : null;
  const locationRange = [toText(locationObj?.city), toText(locationObj?.region), toText(locationObj?.country)]
    .filter(Boolean)
    .join(", ");
  const locationStrRaw = toText(locationValue) || toText(locationObj?.text) || locationRange || null;
  return locationStrRaw && locationStrRaw !== "{}" && locationStrRaw.trim() ? locationStrRaw.trim() : null;
}

export function cardTopics(card: ExperienceCard | ExperienceCardChild | Record<string, unknown>): string[] {
  const cardAny = card as Record<string, unknown>;
  const tags = cardAny.tags;
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
  const items = cardAny.items as Record<string, unknown>[] | undefined;
  if (Array.isArray(items)) return items.map((it) => String(it?.subtitle ?? it?.title ?? "")).filter(Boolean);
  const topics = cardAny.topics;
  if (!Array.isArray(topics)) return [];
  return topics
    .map((t) =>
      typeof t === "object" && t && "label" in t ? String((t as { label?: unknown }).label ?? "") : String(t)
    )
    .filter(Boolean);
}
