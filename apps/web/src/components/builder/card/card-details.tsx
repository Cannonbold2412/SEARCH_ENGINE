import type { ExperienceCard, ExperienceCardChild } from "@/lib/types";
import { CardDetailsCompact } from "./card-details-compact";
import { CardDetailsVerbose } from "./card-details-verbose";
export {
  cardTopics,
  displayCardTitle,
  getChildDisplayItems,
  getChildDisplaySummary,
  getChildDisplayTitle,
  getChildDisplayTitlesAll,
  getChildDisplayTitlesWithDescriptions,
  getLocationFromCard,
  isPlaceholderChildCard,
} from "./card-details-shared";

type CardLike = ExperienceCard | ExperienceCardChild | Record<string, unknown>;

export function CardDetails({
  card,
  compact = false,
  summaryFullWidth = false,
  hideInternalFields = false,
  expandSummary = false,
  hideSummary = false,
  hideTime = false,
  hideLocation = false,
}: {
  card: CardLike;
  compact?: boolean;
  summaryFullWidth?: boolean;
  hideInternalFields?: boolean;
  expandSummary?: boolean;
  hideSummary?: boolean;
  hideTime?: boolean;
  hideLocation?: boolean;
}) {
  if (!card) return null;

  if (hideInternalFields) {
    return (
      <CardDetailsCompact
        card={card}
        compact={compact}
        hideInternalFields={hideInternalFields}
        expandSummary={expandSummary}
        hideSummary={hideSummary}
        hideTime={hideTime}
        hideLocation={hideLocation}
      />
    );
  }

  return <CardDetailsVerbose card={card} compact={compact} summaryFullWidth={summaryFullWidth} />;
}
