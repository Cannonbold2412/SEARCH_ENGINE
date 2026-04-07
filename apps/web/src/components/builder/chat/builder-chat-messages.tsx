"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

function ScrollToBottomButton({ scrollRef }: { scrollRef: RefObject<HTMLDivElement> }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = scrollRef.current?.parentElement;
    if (!el) return;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShow(distanceFromBottom > 120);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [scrollRef]);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => scrollRef.current?.scrollIntoView({ behavior: "smooth" })}
      className="absolute bottom-28 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-md transition-colors hover:text-foreground sm:bottom-24"
      aria-label="Scroll to bottom"
    >
      <ArrowDown className="h-3 w-3" />
      New messages
    </button>
  );
}

type BuilderChatMessagesProps = {
  messages: ChatMessage[];
  loading: boolean;
  commitStatus: "idle" | "saving" | "success" | "error";
  scrollRef: RefObject<HTMLDivElement>;
};

export function BuilderChatMessages({ messages, loading, commitStatus, scrollRef }: BuilderChatMessagesProps) {
  return (
    <div className="relative flex-1 min-h-0 space-y-4 overflow-y-auto p-3 scrollbar-thin scrollbar-theme sm:p-4">
      <AnimatePresence initial={false}>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground"
              )}
            >
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {loading && (
        <div className="flex justify-start">
          <div className="rounded-2xl px-4 py-2.5 bg-muted/60 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Generating your card...</span>
          </div>
        </div>
      )}
      {commitStatus === "success" && (
        <div className="flex justify-start">
          <div className="rounded-2xl px-4 py-2.5 bg-muted/60 text-sm text-foreground">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
              <p className="whitespace-pre-wrap break-words">
                Your card is generated. You can edit it in{" "}
                <Link href="/cards" className="underline underline-offset-2 hover:text-primary transition-colors">
                  Your cards
                </Link>{" "}
                section.
              </p>
            </div>
          </div>
        </div>
      )}
      <div ref={scrollRef} />
      <ScrollToBottomButton scrollRef={scrollRef} />
    </div>
  );
}
