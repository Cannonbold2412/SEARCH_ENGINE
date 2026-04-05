import { Briefcase, Calendar, MapPin, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExperienceCard, ExperienceCardChild } from "@/lib/types";
import { cardTopics, toText } from "./card-details-shared";

type CardLike = ExperienceCard | ExperienceCardChild | Record<string, unknown>;

type CompactCardDetailsProps = {
  card: CardLike;
  compact?: boolean;
  hideInternalFields?: boolean;
  expandSummary?: boolean;
  hideSummary?: boolean;
  hideTime?: boolean;
  hideLocation?: boolean;
};

export function CardDetailsCompact({
  card,
  compact = false,
  hideInternalFields = false,
  expandSummary = false,
  hideSummary = false,
  hideTime = false,
  hideLocation = false,
}: CompactCardDetailsProps) {
  if (!card) return null;
  const cardAny = card as Record<string, unknown>;
  const topicLabels = cardTopics(cardAny);

  const timeObj =
    cardAny.time && typeof cardAny.time === "object"
      ? (cardAny.time as { text?: unknown; start?: unknown; end?: unknown; ongoing?: unknown })
      : null;
  const startDateStr = toText(cardAny.start_date);
  const endDateStr = toText(cardAny.end_date);
  const timeRangeStr = toText(cardAny.time_range);
  const isCurrent = typeof cardAny.is_current === "boolean" ? cardAny.is_current : false;
  const timeObjRange = [toText(timeObj?.start), toText(timeObj?.end)].filter(Boolean).join(" - ");
  const timeTextFromObj = toText(timeObj?.text) || timeObjRange || (timeObj?.ongoing === true ? "Ongoing" : null);
  const dateRange = [startDateStr, endDateStr].filter(Boolean).join(" - ");
  const timeText = timeTextFromObj || timeRangeStr || dateRange || (isCurrent ? "Ongoing" : null);

  const summaryText =
    toText(cardAny.summary) ||
    (Array.isArray(cardAny.items)
      ? toText(
          (cardAny.items as Record<string, unknown>[])[0]?.sub_summary ??
            (cardAny.items as Record<string, unknown>[])[0]?.description
        )
      : null);

  const roleTitleStr = toText(cardAny.normalized_role);
  const companyStr = toText(cardAny.company_name) ?? toText(cardAny.company);

  const locationValue = cardAny.location;
  const locationObj =
    locationValue && typeof locationValue === "object"
      ? (locationValue as { text?: unknown; city?: unknown; region?: unknown; country?: unknown })
      : null;
  const locationRange = [toText(locationObj?.city), toText(locationObj?.region), toText(locationObj?.country)]
    .filter(Boolean)
    .join(", ");
  const locationStrRaw = toText(locationValue) || toText(locationObj?.text) || locationRange || null;
  const locationStr = locationStrRaw && locationStrRaw !== "{}" && locationStrRaw.trim() ? locationStrRaw.trim() : null;

  const domainStr = toText(cardAny.domain);
  const employmentTypeStr = toText(cardAny.employment_type);

  const toolingObj =
    cardAny.tooling && typeof cardAny.tooling === "object"
      ? (cardAny.tooling as { tools?: unknown; processes?: unknown; raw?: unknown })
      : null;
  const tools = (Array.isArray(toolingObj?.tools) ? toolingObj?.tools : [])
    .map((t) => (typeof t === "object" && t && "name" in t ? String((t as { name?: unknown }).name ?? "") : String(t)))
    .filter(Boolean);
  const processes = (Array.isArray(toolingObj?.processes) ? toolingObj?.processes : [])
    .map((p) =>
      typeof p === "object" && p && "name" in p ? String((p as { name?: unknown }).name ?? "") : String(p)
    )
    .filter(Boolean);
  const toolingRaw = toText(toolingObj?.raw);
  const allTools = [...tools, ...processes].filter(Boolean);
  if (toolingRaw && allTools.length === 0) allTools.push(toolingRaw);

  const outcomes = (Array.isArray(cardAny.outcomes) ? cardAny.outcomes : [])
    .map((o) => {
      if (typeof o !== "object" || !o) return null;
      const oo = o as { label?: string; value_text?: string | null };
      const parts = [oo.label, oo.value_text].filter(Boolean);
      return parts.length ? parts.join(": ") : null;
    })
    .filter(Boolean) as string[];

  const metaItems: string[] = [];
  if (roleTitleStr) metaItems.push(roleTitleStr);
  if (companyStr) metaItems.push(companyStr);

  const tagItems: string[] = [];
  if (domainStr) tagItems.push(domainStr);
  if (employmentTypeStr) tagItems.push(employmentTypeStr.replace(/_/g, " "));
  topicLabels.forEach((t) => tagItems.push(t));

  const valueItems = Array.isArray((cardAny.value as { items?: unknown[] })?.items)
    ? (cardAny.value as { items: Record<string, unknown>[] }).items
    : Array.isArray(cardAny.items)
      ? (cardAny.items as Record<string, unknown>[])
      : null;
  const hasValueItems = valueItems && valueItems.length > 0;

  if (!hideInternalFields) {
    return null;
  }

  const hasAnything =
    (summaryText && !hideSummary) ||
    metaItems.length > 0 ||
    timeText ||
    locationStr ||
    tagItems.length > 0 ||
    (hasValueItems ?? false);
  if (!hasAnything) return null;

  return (
    <div className={cn("mt-2.5 space-y-2", compact && "mt-1.5 space-y-1.5")}>
      {summaryText && !hideSummary && (
        <p className={cn("text-sm text-muted-foreground leading-relaxed", !expandSummary && (compact ? "line-clamp-2" : "line-clamp-3"))}>
          {summaryText}
        </p>
      )}

      {(metaItems.length > 0 || (timeText && !hideTime) || (locationStr && !hideLocation)) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {roleTitleStr && (
            <span className="inline-flex items-center gap-1">
              <Briefcase className="h-3 w-3 flex-shrink-0 opacity-60" />
              {roleTitleStr}
            </span>
          )}
          {locationStr && !hideLocation && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 flex-shrink-0 opacity-60" />
              {locationStr}
            </span>
          )}
          {timeText && !hideTime && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3 flex-shrink-0 opacity-60" />
              {timeText}
            </span>
          )}
        </div>
      )}

      {hasValueItems ? (
        <div className="space-y-1">
          {valueItems!.map((it, i) => (
            <div key={i} className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{String(it.subtitle ?? it.title ?? "")}</span>
              {(it.sub_summary ?? it.description) ? (
                <span className="ml-1.5">- {String(it.sub_summary ?? it.description ?? "")}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : tagItems.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tagItems.map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              className="inline-flex items-center rounded-full bg-primary/8 px-2 py-0.5 text-[12px] font-medium text-primary/80"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {allTools.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Wrench className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
          {allTools.slice(0, 5).map((tool, i) => (
            <span key={`${tool}-${i}`} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {tool}
            </span>
          ))}
          {allTools.length > 5 && <span className="text-[11px] text-muted-foreground/60">+{allTools.length - 5}</span>}
        </div>
      )}

      {outcomes.length > 0 && <p className="text-xs text-muted-foreground/80 line-clamp-1">{outcomes.join(" · ")}</p>}
    </div>
  );
}
