/** API / domain types shared across the app */

export {
  INTENTS,
  CHILD_RELATION_TYPES,
  VISIBILITY_VALUES,
  CLAIM_STATES,
  CONFIDENCE_LEVELS,
  REACTIONS,
  ENTITY_TAXONOMY,
  VERIFICATION_STATUS,
  VERIFICATION_METHODS,
  EVIDENCE_TYPES,
  TOOL_TYPES,
} from "@/lib/schemas";

export type {
  Intent,
  ChildRelationType,
  Visibility,
  ClaimState,
  Confidence,
  Reaction,
  EntityType,
  Person,
  ExperienceCardSchema,
  LocationBasic,
  PersonVerification,
  PersonPrivacyDefaults,
  LanguageField,
  TimeField,
  LocationWithConfidence,
  RoleItem,
  ActionItem,
  TopicItem,
  EntityItem,
  ToolItem,
  ProcessItem,
  ToolingField,
  OutcomeItem,
  EvidenceItem,
  PrivacyField,
  QualityField,
  IndexField,
} from "@/lib/schemas";

export type PersonSearchResult = {
  id: string;
  name: string | null;
  headline: string | null;
  bio: string | null;
  profile_photo_url?: string | null;
  similarity_percent?: number | null;
  why_matched?: string[];
  open_to_work: boolean;
  open_to_contact: boolean;
  work_preferred_locations: string[];
  work_preferred_salary_min: number | null;
  matched_cards: ExperienceCard[];
};

export type PersonListItem = {
  id: string;
  display_name: string | null;
  current_location: string | null;
  experience_summaries: string[];
};

export type PersonListResponse = {
  people: PersonListItem[];
};

export type UnlockedCardItem = {
  person_id: string;
  search_id: string;
  display_name: string | null;
  current_location: string | null;
  open_to_work: boolean;
  open_to_contact: boolean;
  experience_summaries: string[];
  unlocked_at: string | null;
};

export type UnlockedCardsResponse = {
  cards: UnlockedCardItem[];
};

export type PersonPublicProfile = {
  id: string;
  display_name: string | null;
  bio: BioResponse | null;
  card_families: { parent: ExperienceCard; children: ExperienceCardChild[] }[];
};

export type SearchResponse = {
  search_id: string;
  people: PersonSearchResult[];
};

export type SavedSearchItem = {
  id: string;
  query_text: string;
  created_at: string;
  expires_at: string;
  expired: boolean;
  result_count: number;
};

export type SavedSearchesResponse = {
  searches: SavedSearchItem[];
};

export type ExperienceCard = {
  id: string;
  user_id: string;
  title: string | null;
  normalized_role: string | null;
  domain: string | null;
  sub_domain: string | null;
  company_name: string | null;
  company_type: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean | null;
  location: string | null;
  employment_type: string | null;
  summary: string | null;
  raw_text: string | null;
  intent_primary: string | null;
  intent_secondary: string[];
  seniority_level: string | null;
  confidence_score: number | null;
  experience_card_visibility: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type ExperienceCardCreate = {
  title?: string | null;
  normalized_role?: string | null;
  domain?: string | null;
  sub_domain?: string | null;
  company_name?: string | null;
  company_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean | null;
  location?: string | null;
  employment_type?: string | null;
  summary?: string | null;
  raw_text?: string | null;
  intent_primary?: string | null;
  intent_secondary?: string[] | null;
  seniority_level?: string | null;
  confidence_score?: number | null;
  experience_card_visibility?: boolean | null;
};

export type ExperienceCardPatch = {
  title?: string | null;
  normalized_role?: string | null;
  domain?: string | null;
  sub_domain?: string | null;
  company_name?: string | null;
  company_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean | null;
  location?: string | null;
  employment_type?: string | null;
  summary?: string | null;
  raw_text?: string | null;
  intent_primary?: string | null;
  intent_secondary?: string[] | null;
  seniority_level?: string | null;
  confidence_score?: number | null;
  experience_card_visibility?: boolean | null;
};

export type ContactDetails = {
  email_visible: boolean;
  email?: string | null;
  phone: string | null;
  linkedin_url: string | null;
  other: string | null;
};

export type PersonProfile = {
  id: string;
  display_name: string | null;
  open_to_work: boolean;
  open_to_contact: boolean;
  work_preferred_locations: string[];
  work_preferred_salary_min: number | null;
  experience_cards: ExperienceCard[];
  card_families?: { parent: ExperienceCard; children: ExperienceCardChild[] }[];
  bio?: BioResponse | null;
  contact: ContactDetails | null;
};

export type DraftCardFamily = {
  parent: ExperienceCard | Record<string, unknown>;
  children: ExperienceCardChild[];
};

export type DetectedExperienceItem = {
  index: number;
  label: string;
  suggested?: boolean;
};

export type ExperienceCardChildPatch = {
  items?: ChildValueItem[] | null;
};

export type ChildValueItem = {
  subtitle: string;
  sub_summary?: string | null;
};

export type ChildValue = {
  summary?: string | null;
  raw_text?: string | null;
  items?: ChildValueItem[];
};

export type ExperienceCardChild = {
  id: string;
  parent_experience_id?: string | null;
  child_type: string;
  items: ChildValueItem[];
};

export type SavedCardFamily = {
  parent: ExperienceCard;
  children: ExperienceCardChild[];
};

export type BioResponse = {
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  current_city: string | null;
  profile_photo_url: string | null;
  school: string | null;
  college: string | null;
  current_company: string | null;
  past_companies: { company_name: string; role?: string; years?: string }[] | null;
  email: string | null;
  linkedin_url: string | null;
  phone: string | null;
  complete: boolean;
};

export type VisibilitySettingsResponse = {
  open_to_work: boolean;
  work_preferred_locations: string[];
  work_preferred_salary_min: number | null;
  open_to_contact: boolean;
  preferred_language: string;
};

export type PatchVisibilityRequest = {
  open_to_work?: boolean;
  work_preferred_locations?: string[];
  work_preferred_salary_min?: number | null;
  open_to_contact?: boolean;
  preferred_language?: string;
};

// Chat / Messaging types
export type ConversationPeer = {
  id: string;
  display_name: string | null;
};

export type ConversationSummary = {
  id: string;
  peer: ConversationPeer;
  last_message_preview: string | null;
  last_message_at: string | null;
};

export type MessageItem = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  is_mine: boolean;
};

export type ConversationDetail = {
  id: string;
  peer: ConversationPeer;
  messages: MessageItem[];
};
