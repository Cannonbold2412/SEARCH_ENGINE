"use client";

import { motion } from "framer-motion";
import { BuilderChat } from "@/components/builder";

export default function BuilderPage() {
  return (
    <motion.div
      className="flex flex-col min-h-0 h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] overflow-hidden -mt-2 sm:-mt-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-center mb-2 sm:mb-3 flex-shrink-0 px-1">
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
