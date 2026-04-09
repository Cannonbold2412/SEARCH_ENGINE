export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export type BuilderSessionCommitResponse = {
  session_id: string;
  session_status: string;
  working_narrative?: string | null;
  committed_card_ids: string[];
  committed_card_count: number;
  cards?: import("@/lib/types").ExperienceCard[];
  children?: import("@/lib/types").ExperienceCardChild[];
};

export type PersistedBuilderChatState = {
  messages: ChatMessage[];
  surfacedInsights: string[];
};
