import type { PersonProfile } from "./index";

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

