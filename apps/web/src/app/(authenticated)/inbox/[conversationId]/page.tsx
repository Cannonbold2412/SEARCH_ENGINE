"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";

import { api } from "@/lib/api";
import type { ConversationDetail, MessageItem } from "@/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageLoading, PageError } from "@/components/feedback";

export default function ConversationPage() {
  const params = useParams();
  const conversationId = params.conversationId as string;
  const queryClient = useQueryClient();
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const conversationQuery = useQuery({
    queryKey: ["chat", "conversation", conversationId],
    queryFn: () => api<ConversationDetail>(`/chat/conversations/${conversationId}`),
    enabled: !!conversationId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: (body: string) =>
      api<MessageItem>(`/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        body: { body },
      }),
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({
        queryKey: ["chat", "conversation", conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
  });

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [conversationQuery.data?.messages.length]);

  if (conversationQuery.isLoading) {
    return <PageLoading message="Loading chat..." />;
  }

  if (conversationQuery.isError || !conversationQuery.data) {
    return (
      <PageError
        message={
          conversationQuery.error instanceof Error
            ? conversationQuery.error.message
            : "Failed to load chat"
        }
        backHref="/inbox"
        backLabel="Back to inbox"
      />
    );
  }

  const conversation = conversationQuery.data;

  const handleSend = () => {
    const text = messageText.trim();
    if (!text || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(text);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="max-w-2xl mx-auto space-y-4 h-[calc(100vh-6rem)]"
    >
      <Link
        href="/inbox"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 group"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        Back to inbox
      </Link>

      <Card className="flex flex-col h-full">
        <CardHeader className="flex flex-row items-center gap-3 pb-3">
          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">
              Chat with {conversation.peer.display_name ?? "Person"}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col flex-1 gap-3 pt-0">
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 pb-2">
            {conversation.messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center mt-4">
                No messages yet. Say hi!
              </p>
            ) : (
              conversation.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.is_mine ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                      msg.is_mine
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {msg.body}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t pt-3 space-y-2">
            <Textarea
              placeholder="Type a message..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={2}
              className="resize-none"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSend}
                disabled={sendMessageMutation.isPending || !messageText.trim()}
              >
                {sendMessageMutation.isPending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

