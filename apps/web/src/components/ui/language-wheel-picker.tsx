"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";

interface LanguageWheelPickerProps {
  value: string;
  onChange: (lang: string) => void;
  disabled?: boolean;
  className?: string;
}

const ITEM_HEIGHT = 56; // h-14

const LanguageWheelPicker = React.forwardRef<HTMLDivElement, LanguageWheelPickerProps>(
  ({ value, onChange, disabled = false, className }, ref) => {
    const scrollRef = React.useRef<HTMLDivElement>(null);

    const currentIndex = SUPPORTED_LANGUAGES.findIndex((lang) => lang.code === value);
    const validIndex = currentIndex >= 0 ? currentIndex : 0;

    const scrollSelectedIntoCenter = React.useCallback((index: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const rowCenter = index * ITEM_HEIGHT + ITEM_HEIGHT / 2;
      const target = rowCenter - el.clientHeight / 2;
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTo({ top: Math.max(0, Math.min(max, target)), behavior: "smooth" });
    }, []);

    React.useLayoutEffect(() => {
      scrollSelectedIntoCenter(validIndex);
    }, [validIndex, scrollSelectedIntoCenter]);

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent) => {
        if (disabled) return;

        let newIndex = validIndex;
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          newIndex = Math.min(SUPPORTED_LANGUAGES.length - 1, validIndex + 1);
          e.preventDefault();
        } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          newIndex = Math.max(0, validIndex - 1);
          e.preventDefault();
        } else {
          return;
        }

        if (newIndex !== validIndex) {
          onChange(SUPPORTED_LANGUAGES[newIndex].code);
        }
      },
      [validIndex, onChange, disabled]
    );

    return (
      <div
        ref={ref}
        className={cn("relative w-full", className)}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="listbox"
        aria-label="Language selector"
      >
        <div className="relative h-64 bg-gradient-to-b from-background/0 via-background to-background/0 rounded-lg overflow-hidden sm:h-72">
          <div
            ref={scrollRef}
            className="relative h-full w-full overflow-y-auto overscroll-contain scrollbar-hide snap-y snap-mandatory"
          >
            <div className="py-2">
              <div className="relative space-y-0">
                {SUPPORTED_LANGUAGES.map((language) => {
                  const isSelected = language.code === value;
                  return (
                    <motion.button
                      key={language.code}
                      onClick={() => !disabled && onChange(language.code)}
                      disabled={disabled}
                      className={cn(
                        "relative flex h-14 w-full snap-center items-center justify-start px-4 transition-all duration-200",
                        "hover:bg-accent/50 disabled:cursor-not-allowed",
                        isSelected && "bg-accent/30"
                      )}
                      whileHover={!disabled ? { scale: 1.02 } : {}}
                      whileTap={!disabled ? { scale: 0.98 } : {}}
                    >
                      <div className="flex flex-1 flex-col items-start">
                        <div className="text-sm font-medium text-foreground">
                          {language.name}
                          {isSelected && <span className="ml-2 text-xs text-muted-foreground">✓</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">{language.nativeName}</div>
                      </div>
                      {language.flag && <span className="ml-2 text-lg">{language.flag}</span>}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-0 right-0 left-0 h-12 bg-gradient-to-b from-background to-transparent" />
            <div className="absolute right-0 bottom-0 left-0 h-12 bg-gradient-to-t from-background to-transparent" />
          </div>
        </div>

        <div className="absolute top-1/2 left-0 h-14 w-1 -translate-y-1/2 rounded-r-sm bg-primary" />

        <div className="absolute top-1/2 left-6 h-14 w-0.5 -translate-y-1/2 rounded-full bg-border/30" />
      </div>
    );
  }
);

LanguageWheelPicker.displayName = "LanguageWheelPicker";

export { LanguageWheelPicker };
