"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { MessageCircle, Clock3, Search, Globe } from "lucide-react";
import Link from "next/link";

import { api } from "@/lib/api";
import type { ConversationSummary } from "@/types";
import { PageLoading, PageError } from "@/components/feedback";
import { cn } from "@/lib/utils";

function formatConversationTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 7) {
    return date.toLocaleDateString(undefined, {
      weekday: "short",
    });
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function InboxPage() {
  const router = useRouter();

  const conversationsQuery = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: () => api<ConversationSummary[]>("/chat/conversations"),
    staleTime: 60_000,
  });

  if (conversationsQuery.isLoading) {
    return <PageLoading message="Loading inbox..." />;
  }

  if (conversationsQuery.isError) {
    return (
      <PageError
        message={
          conversationsQuery.error instanceof Error
            ? conversationsQuery.error.message
            : "Failed to load inbox"
        }
        backHref="/home"
        backLabel="Back to Home"
      />
    );
  }

  const conversations = conversationsQuery.data ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        </div>
      </div>

      {conversations.length === 0 ? (
        <div className="py-12 text-center rounded-lg border border-dashed border-border/60">
          <MessageCircle className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            You don&apos;t have any chats yet.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1 mb-4">
            Find someone interesting, then start a chat from their profile.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/home"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Search className="h-3.5 w-3.5" />
              Search people
            </Link>
            <span className="text-muted-foreground/40">or</span>
            <Link
              href="/explore"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Globe className="h-3.5 w-3.5" />
              Explore profiles
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-1" role="list">
          {conversations.map((conv) => (
            <li key={conv.id}>
              <button
                type="button"
                onClick={() => router.push(`/inbox/${conv.id}`)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                  "hover:bg-accent min-h-[52px]"
                )}
              >
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-medium">
                    {conv.peer.display_name?.[0]?.toUpperCase() ?? "P"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {conv.peer.display_name ?? "Person"}
                    </span>
                    {conv.last_message_at && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground flex-shrink-0">
                        <Clock3 className="h-3 w-3" />
                        {formatConversationTime(conv.last_message_at)}
                      </span>
                    )}
                  </div>
                  {conv.last_message_preview && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {conv.last_message_preview}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
