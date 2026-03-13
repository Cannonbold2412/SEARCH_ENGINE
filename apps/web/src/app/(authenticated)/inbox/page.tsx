"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { MessageCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

import { api } from "@/lib/api";
import type { ConversationSummary } from "@/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageLoading, PageError } from "@/components/feedback";

export default function InboxPage() {
  const router = useRouter();

  const conversationsQuery = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: () => api<ConversationSummary[]>("/chat/conversations"),
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
        backLabel="Back to Discover"
      />
    );
  }

  const conversations = conversationsQuery.data ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <Link
        href="/home"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 group"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        Back to Search
      </Link>

      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Chats you&apos;ve started with people.
          </p>
        </div>
      </div>

      {conversations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            You don&apos;t have any chats yet. Open a profile and start a chat to see it here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {conversations.map((conv) => (
            <Card
              key={conv.id}
              className="cursor-pointer hover:bg-accent transition-colors"
              onClick={() => router.push(`/inbox/${conv.id}`)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-xs font-medium">
                      {conv.peer.display_name?.[0]?.toUpperCase() ?? "P"}
                    </span>
                  </div>
                  <div>
                    <CardTitle className="text-sm font-medium">
                      {conv.peer.display_name ?? "Person"}
                    </CardTitle>
                    {conv.last_message_preview && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {conv.last_message_preview}
                      </p>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}

