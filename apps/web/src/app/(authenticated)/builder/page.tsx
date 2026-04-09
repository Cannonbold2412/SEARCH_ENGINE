"use client";

import { motion } from "framer-motion";
import { BuilderChat } from "@/components/builder";

export default function Page() {
  return (
    <motion.div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div className="mb-2 flex shrink-0 items-center justify-center px-1 sm:mb-3">
        <h1 className="text-base sm:text-lg font-semibold tracking-tight text-foreground truncate text-center">
          Builder
        </h1>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        <BuilderChat />
      </div>
    </motion.div>
  );
}
