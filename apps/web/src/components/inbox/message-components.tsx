"use client";

import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { type MessageStatus, formatDateSeparator } from "./chat-utils";

export function MessageStatusIcon({ status }: { status?: MessageStatus }) {
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

export function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center justify-center my-4">
      <div className="h-px bg-border/60 flex-1" />
      <span className="px-3 py-1 text-[11px] font-medium text-muted-foreground bg-muted rounded-full mx-2">
        {formatDateSeparator(date)}
      </span>
      <div className="h-px bg-border/60 flex-1" />
    </div>
  );
}
