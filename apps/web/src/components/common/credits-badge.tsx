"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { useCredits } from "@/hooks";
import { cn } from "@/lib/utils";

const LOW_CREDITS_THRESHOLD = 5;

export function CreditsBadge() {
  const { data: credits } = useCredits();
  const balance = credits?.balance;
  const isLow = typeof balance === "number" && balance < LOW_CREDITS_THRESHOLD;

  return (
    <Link
      href="/credits"
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 min-h-[44px] min-w-[44px] rounded-lg transition-colors",
        isLow
          ? "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      )}
      title={isLow ? "Low credits — tap to buy more" : undefined}
    >
      <Coins className="h-3.5 w-3.5" />
      <span className="text-xs font-medium tabular-nums">
        {balance ?? "--"}
      </span>
      <span className="hidden text-xs sm:inline">credits</span>
    </Link>
  );
}
