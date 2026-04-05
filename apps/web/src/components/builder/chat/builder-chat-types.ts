export type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export type ClarifyHistoryEntry = {
  role: string;
  kind: "clarify_question" | "clarify_answer";
  target_type?: string | null;
  target_field?: string | null;
  target_child_type?: string | null;
  profile_axes?: string[] | null;
  text: string;
};

export type ClarifyOption = { parent_id: string; label: string };

export type BuilderSessionCommitResponse = {
  session_id: string;
  session_status: string;
  working_narrative?: string | null;
  committed_card_ids: string[];
  committed_card_count: number;
};

export type PersistedBuilderChatState = {
  messages: ChatMessage[];
  surfacedInsights: string[];
};
