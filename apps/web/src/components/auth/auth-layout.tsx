"use client";

import { motion } from "framer-motion";
import { AuthBg, DepthGrid } from "@/components/common";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-app-screen flex-col items-center justify-center px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-4">
      <AuthBg />
      <DepthGrid />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="mb-6 text-center sm:mb-8">
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
            {title}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{subtitle}</p>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
