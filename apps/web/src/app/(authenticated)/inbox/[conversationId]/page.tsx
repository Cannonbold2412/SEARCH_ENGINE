"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  MessageCircle,
  Send,
  MoreVertical,
  Phone,
  Video,
  Info,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Paperclip,
  Smile,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ConversationDetail, MessageItem } from "@/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageLoading, PageError } from "@/components/feedback";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../../components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../../components/ui/tooltip";

// Message status types for UI state
type MessageStatus = "sending" | "sent" | "delivered" | "read" | "error";

interface MessageWithStatus extends MessageItem {
  status?: MessageStatus;
}

// Format message time with smart defaults
function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

// Format date separator
function formatDateSeparator(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return "Yesterday";

  // Within last 7 days - show day name
  const daysDiff = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysDiff < 7) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }

  // Older - show full date
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

// Check if messages are on the same day
function isSameDay(a: string, b: string): boolean {
  const dateA = new Date(a);
  const dateB = new Date(b);
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

// Get initials from display name
function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Generate avatar color based on name
function getAvatarColor(name: string | null | undefined): string {
  if (!name) return "bg-muted text-muted-foreground";
  const colors = [
    "bg-blue-500/15 text-blue-400",
    "bg-emerald-500/15 text-emerald-400",
    "bg-violet-500/15 text-violet-400",
    "bg-pink-500/15 text-pink-400",
    "bg-amber-500/15 text-amber-400",
    "bg-indigo-500/15 text-indigo-400",
    "bg-teal-500/15 text-teal-400",
    "bg-orange-500/15 text-orange-400",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Message status icon component
function MessageStatusIcon({ status }: { status?: MessageStatus }) {
  if (!status || status === "sent") {
    return <Check className="h-3 w-3" />;
  }
  if (status === "delivered" || status === "read") {
    return <CheckCheck className={cn("h-3 w-3", status === "read" && "text-blue-500")} />;
  }
  if (status === "sending") {
    return <Clock className="h-3 w-3 animate-pulse" />;
  }
  if (status === "error") {
    return <AlertCircle className="h-3 w-3 text-destructive" />;
  }
  return null;
}

// Date separator component
function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center justify-center my-4">
      <div className="h-px bg-border flex-1" />
      <span className="px-3 py-1 text-[11px] font-medium text-muted-foreground bg-muted rounded-full mx-2">
        {formatDateSeparator(date)}
      </span>
      <div className="h-px bg-border flex-1" />
    </div>
  );
}

export default function ConversationPage() {
  const params = useParams();
  const conversationId = params.conversationId as string;
  const queryClient = useQueryClient();
  const [messageText, setMessageText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [messageText, adjustTextareaHeight]);

  const conversationQuery = useQuery({
    queryKey: ["chat", "conversation", conversationId],
    queryFn: () => api<ConversationDetail>(`/chat/conversations/${conversationId}`),
    enabled: !!conversationId,
    refetchInterval: 30000, // Poll every 30 seconds for new messages
  });

  const sendMessageMutation = useMutation({
    mutationFn: (body: string) =>
      api<MessageItem>(`/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        body: { body },
      }),
    onMutate: async (body: string) => {
      const tempId = `temp-${Date.now()}`;
      const createdAt = new Date().toISOString();

      await queryClient.cancelQueries({ queryKey: ["chat", "conversation", conversationId] });

      const previousConversation = queryClient.getQueryData<ConversationDetail>([
        "chat",
        "conversation",
        conversationId,
      ]);

      if (previousConversation) {
        const optimisticMessage: MessageWithStatus = {
          id: tempId,
          conversation_id: conversationId,
          sender_id: "me", // Temporary sender id
          body,
          created_at: createdAt,
          is_mine: true,
          status: "sending",
        };

        queryClient.setQueryData<ConversationDetail>(
          ["chat", "conversation", conversationId],
          {
            ...previousConversation,
            messages: [...previousConversation.messages, optimisticMessage],
          }
        );
      }

      setMessageText("");
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      return { previousConversation };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousConversation) {
        // Mark the last temp message as error
        const updated = { ...context.previousConversation };
        const lastMsg = updated.messages[updated.messages.length - 1];
        if (lastMsg && String(lastMsg.id).startsWith("temp-")) {
          (lastMsg as MessageWithStatus).status = "error";
        }
        queryClient.setQueryData<ConversationDetail>(
          ["chat", "conversation", conversationId],
          updated
        );
      }
    },
    onSuccess: (data, _variables, context) => {
      queryClient.setQueryData<ConversationDetail>(
        ["chat", "conversation", conversationId],
        (current) => {
          if (!current) return current;
          const withoutTemp = current.messages.filter((m) => !String(m.id).startsWith("temp-"));
          return {
            ...current,
            messages: [...withoutTemp, { ...data, status: "sent" }],
          };
        }
      );

      queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
    },
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    }
  }, [conversationQuery.data?.messages.length]);

  // Simulate typing indicator when receiving messages (demo feature)
  useEffect(() => {
    if (!conversationQuery.data?.messages.length) return;
    const lastMsg = conversationQuery.data.messages[conversationQuery.data.messages.length - 1];
    if (!lastMsg.is_mine) {
      setIsTyping(false);
    }
  }, [conversationQuery.data?.messages]);

  if (conversationQuery.isLoading) {
    return (
      <div className="max-w-3xl mx-auto h-[calc(100vh-6rem)] flex flex-col">
        <Card className="flex flex-col h-full border-none bg-card/90">
          <CardHeader className="flex flex-row items-center gap-3 px-4 py-3 border-b border-border/20">
            <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              <div className="h-3 w-20 bg-muted rounded animate-pulse" />
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading conversation...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (conversationQuery.isError || !conversationQuery.data) {
    return (
      <PageError
        message={
          conversationQuery.error instanceof Error
            ? conversationQuery.error.message
            : "Failed to load conversation"
        }
        backHref="/inbox"
        backLabel="Back to Inbox"
      />
    );
  }

  const conversation = conversationQuery.data;
  const peer = conversation.peer;
  const avatarColor = getAvatarColor(peer.display_name);
  const isOnline = false; // Would come from real-time status in production

  const handleSend = () => {
    const attachmentLabel =
      attachments.length > 0
        ? `\n\n[Attachments: ${attachments.map((f) => f.name).join(", ")}]`
        : "";
    const text = `${messageText}${attachmentLabel}`.trim();
    if (!text || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(text);
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAttachClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setAttachments((prev) => [...prev, ...files]);
    // Allow re-selecting the same file(s)
    e.target.value = "";
  };

  const handleAddEmoji = (emoji: string) => {
    setMessageText((prev) => `${prev}${emoji}`);
    setShowEmojiPicker(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Group messages for display
  const messages = conversation.messages as MessageWithStatus[];
  let lastDate: string | null = null;

  return (
    <TooltipProvider delayDuration={300}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
        className="max-w-3xl mx-auto h-[calc(100vh-6rem)] flex flex-col"
      >
        <Card className="flex flex-col h-full shadow-sm border border-zinc-700/60 overflow-hidden bg-gradient-to-b from-background/80 to-background/60">
          {/* Header */}
          <CardHeader className="flex flex-row items-center gap-3 px-4 py-3 border-b border-zinc-700/60 bg-gradient-to-r from-background/80 to-background/60 shrink-0">
            <Link
              href="/inbox"
              className="inline-flex items-center justify-center h-9 w-9 -ml-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            {/* Avatar */}
            <div className="relative shrink-0">
              <div
                className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold ring-2 ring-background",
                  avatarColor
                )}
              >
                {getInitials(peer.display_name)}
              </div>
              {isOnline && (
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-background" />
              )}
            </div>

            {/* User Info */}
            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm font-semibold truncate">
                {peer.display_name || "Anonymous"}
              </CardTitle>
            </div>

            {/* Actions removed */}
          </CardHeader>

          {/* Messages */}
          <CardContent className="flex-1 min-h-0 p-0">
            <div
              ref={scrollContainerRef}
              className="h-full overflow-y-auto scrollbar-theme px-4 py-4"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 via-secondary/10 to-primary/5 flex items-center justify-center mb-4 ring-1 ring-primary/25 shadow-md"
                  >
                    <MessageCircle className="h-8 w-8 text-primary" />
                  </motion.div>
                  <h3 className="text-base font-semibold text-foreground mb-1">
                    Start a conversation
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-[260px] mb-6">
                    Send a message to {peer.display_name || "this person"} to begin chatting.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {["Hello! 👋", "How are you?", "Nice to meet you!"].map((text) => (
                      <button
                        key={text}
                        onClick={() => sendMessageMutation.mutate(text)}
                        className="px-3 py-1.5 text-sm bg-muted hover:bg-accent rounded-full transition-colors"
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {messages.map((msg, index) => {
                    const showDateSeparator = !lastDate || !isSameDay(lastDate, msg.created_at);
                    lastDate = msg.created_at;

                    // Check if this is the first message in a group
                    const prevMsg = index > 0 ? messages[index - 1] : null;
                    const isFirstInGroup = !prevMsg || prevMsg.is_mine !== msg.is_mine;

                    // Check if this is the last message in a group
                    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
                    const isLastInGroup = !nextMsg || nextMsg.is_mine !== msg.is_mine;

                    return (
                      <div key={msg.id}>
                        {showDateSeparator && <DateSeparator date={msg.created_at} />}
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className={cn(
                            "flex",
                            msg.is_mine ? "justify-end" : "justify-start",
                            isFirstInGroup && "mt-2"
                          )}
                        >
                          <div
                            className={cn(
                              "flex gap-2 max-w-[85%] sm:max-w-[75%]",
                              msg.is_mine ? "flex-row-reverse" : "flex-row"
                            )}
                          >
                            {/* Avatar for other person */}
                            {!msg.is_mine && (
                              <div className="shrink-0 self-end">
                                {isLastInGroup ? (
                                  <div
                                    className={cn(
                                      "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold",
                                      avatarColor
                                    )}
                                  >
                                    {getInitials(peer.display_name)}
                                  </div>
                                ) : (
                                  <div className="h-7 w-7" />
                                )}
                              </div>
                            )}

                            {/* Message bubble */}
                            <div
                              className={cn(
                                "flex flex-col",
                                msg.is_mine ? "items-end" : "items-start"
                              )}
                            >
                              <div
                                className={cn(
                                  "relative px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                                  msg.is_mine
                                    ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
                                    : "bg-muted text-foreground rounded-2xl rounded-bl-sm",
                                  isFirstInGroup && (msg.is_mine ? "rounded-tr-2xl" : "rounded-tl-2xl")
                                )}
                              >
                                {msg.body}
                              </div>

                              {/* Timestamp and status */}
                              <div
                                className={cn(
                                  "flex items-center gap-1 mt-1",
                                  msg.is_mine ? "flex-row" : "flex-row-reverse"
                                )}
                              >
                                <span className="text-[11px] text-muted-foreground">
                                  {formatMessageTime(msg.created_at)}
                                </span>
                                {msg.is_mine && (
                                  <span className="text-muted-foreground">
                                    <MessageStatusIcon status={msg.status} />
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    );
                  })}

                  {/* Typing indicator */}
                  <AnimatePresence>
                    {isTyping && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="flex justify-start mt-2"
                      >
                        <div className="flex gap-2 items-end">
                          <div
                            className={cn(
                              "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold",
                              avatarColor
                            )}
                          >
                            {getInitials(peer.display_name)}
                          </div>
                          <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
                            <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div ref={messagesEndRef} className="h-1" />
                </div>
              )}
            </div>
          </CardContent>

          {/* Input area */}
          <div className="border-t border-zinc-700/60 bg-gradient-to-r from-background/80 to-background/60 p-3 sm:p-4 shrink-0">
            <div className="relative flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-2xl bg-zinc-900/70 border border-zinc-700/70 px-2.5 py-1.5 flex-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={handleAttachClick}
                      className="shrink-0 h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    >
                      <Paperclip className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Attach file</TooltipContent>
                </Tooltip>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFilesSelected}
                />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={() => setShowEmojiPicker((prev) => !prev)}
                      className="shrink-0 h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    >
                      <Smile className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add emoji</TooltipContent>
                </Tooltip>

                <Textarea
                  ref={textareaRef}
                  placeholder={`Message ${peer.display_name || ""}...`}
                  value={messageText}
                  onChange={(e) => {
                    setMessageText(e.target.value);
                    // Simulate typing indicator logic would go here
                  }}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className="flex-1 min-h-[36px] max-h-[120px] resize-none border-0 bg-transparent px-2 py-2 text-sm leading-snug focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-0 placeholder:text-muted-foreground/70 scrollbar-thin"
                />
              </div>

              {/* Simple emoji picker popover */}
              {showEmojiPicker && (
                <div className="absolute -top-2 left-2 right-16 mb-2 translate-y-[-100%] z-20 rounded-xl border border-zinc-700 bg-background/95 shadow-lg p-2 flex flex-wrap gap-1 max-w-[260px]">
                  {["😀", "😁", "😂", "😊", "😍", "🤔", "🙏", "🎉", "👍", "❤️"].map(
                    (emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleAddEmoji(emoji)}
                        className="text-xl leading-none px-1 hover:bg-zinc-800 rounded-md"
                      >
                        {emoji}
                      </button>
                    )
                  )}
                </div>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={sendMessageMutation.isPending || !messageText.trim()}
                    className={cn(
                      "shrink-0 h-10 w-10 rounded-full transition-all duration-200",
                      messageText.trim()
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {sendMessageMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send message</TooltipContent>
              </Tooltip>
            </div>

            {attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                {attachments.map((file, index) => (
                  <span
                    key={`${file.name}-${index}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-900/80 border border-zinc-700/80"
                  >
                    {file.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
      </motion.div>
    </TooltipProvider>
  );
}
