import type { ExperienceCard, ExperienceCardChild } from "@/lib/types";
import { getChildDisplayTitlesWithDescriptions } from "@/components/builder/card/card-details";

export type EditAssistantVariableValues = Record<string, string>;

/**
 * Template variables for the edit-card Vapi assistant (`variableValues` in `start()`).
 * Use {{cardTitle}}, {{companyName}}, etc. in the dashboard system prompt.
 * 
 * Includes ONLY user-visible card fields (matching what's shown in the edit form).
 */
export function buildEditAssistantVariableValues(
  parent: ExperienceCard,
  children: ExperienceCardChild[],
  options?: { weakSignals?: string }
): EditAssistantVariableValues {
  // Format dates
  const formatDate = (date: string | null | undefined): string => {
    if (!date?.trim()) return "(not set)";
    return date.trim();
  };

  const formatDateRange = (start: string | null | undefined, end: string | null | undefined, isCurrent: boolean | null): string => {
    const startStr = formatDate(start);
    const endStr = isCurrent ? "Present" : formatDate(end);
    if (startStr === "(not set)" && endStr === "(not set)") return "(not set)";
    if (startStr === "(not set)") return endStr;
    if (endStr === "(not set)") return startStr;
    return `${startStr} - ${endStr}`;
  };

  // User-visible parent card fields only (matching edit form fields)
  const title = (parent.title ?? parent.normalized_role ?? "").trim() || "Experience";
  const normalizedRole = (parent.normalized_role ?? "").trim() || "(not set)";
  const summary = (parent.summary ?? "").trim() || "(no summary yet)";
  const companyName = (parent.company_name ?? "").trim() || "(not set)";
  const companyType = (parent.company_type ?? "").trim() || "(not set)";
  const location = (parent.location ?? "").trim() || "(not set)";
  const domain = (parent.domain ?? "").trim() || "(not set)";
  const subDomain = (parent.sub_domain ?? "").trim() || "(not set)";
  const employmentType = (parent.employment_type ?? "").trim() || "(not set)";
  const seniorityLevel = (parent.seniority_level ?? "").trim() || "(not set)";
  const timeRange = formatDateRange(parent.start_date, parent.end_date, parent.is_current);
  
  // Intent fields are visible in the "Meta" section of the edit form
  const intentPrimary = (parent.intent_primary ?? "").trim() || "(not set)";
  const intentSecondary = Array.isArray(parent.intent_secondary) && parent.intent_secondary.length > 0
    ? parent.intent_secondary.join(", ")
    : "(not set)";

  // Build child card sections dynamically for ALL child types
  const childTypeGroups = new Map<string, string[]>();
  for (const child of children) {
    const childType = (child.child_type ?? "").toLowerCase();
    if (!childType) continue;
    
    const content = getChildDisplayTitlesWithDescriptions(child);
    if (!content) continue;
    
    if (!childTypeGroups.has(childType)) {
      childTypeGroups.set(childType, []);
    }
    childTypeGroups.get(childType)!.push(content);
  }

  // Build variables object with user-visible fields only
  const variables: EditAssistantVariableValues = {
    // Core fields (backward compatible)
    cardTitle: title,
    cardSummary: summary,
    
    // All user-visible parent fields
    normalizedRole,
    companyName,
    companyType,
    location,
    domain,
    subDomain,
    employmentType,
    seniorityLevel,
    timeRange,
    intentPrimary,
    intentSecondary,
    
    // Diagnostic hints
    missingOrWeak: (options?.weakSignals ?? buildWeakSignals(parent)).trim(),
  };

  // Add all child types dynamically
  for (const [childType, contents] of childTypeGroups.entries()) {
    const variableName = childType.replace(/[^a-zA-Z0-9]/g, ""); // Remove special chars
    variables[variableName] = contents.join("\n\n");
  }

  // Add backward-compatible aliases for common child types
  // Note: if child_type was already "skills" or "responsibilities", it's already in variables
  if (!variables.strengths) {
    variables.strengths = variables.skills || "(none listed)";
  }
  if (!variables.responsibilities) {
    variables.responsibilities = "(none listed)";
  }

  return variables;
}

function buildWeakSignals(card: ExperienceCard): string {
  const hints: string[] = [];
  if (!card.summary?.trim()) hints.push("summary is thin or empty");
  if (!card.normalized_role?.trim()) hints.push("role title unclear");
  if (!card.company_name?.trim()) hints.push("company missing");
  if (hints.length === 0) return "Card is fairly complete; focus on impact, metrics, and proof.";
  return hints.join("; ");
}
