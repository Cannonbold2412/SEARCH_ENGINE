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

const ITEM_HEIGHT = 56; // Height of each language item in pixels
const VISIBLE_ITEMS = 5; // Number of items visible at a time

const LanguageWheelPicker = React.forwardRef<HTMLDivElement, LanguageWheelPickerProps>(
  ({ value, onChange, disabled = false, className }, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const [isScrolling, setIsScrolling] = React.useState(false);
    const scrollTimeoutRef = React.useRef<NodeJS.Timeout>();

    const currentIndex = SUPPORTED_LANGUAGES.findIndex((lang) => lang.code === value);
    const validIndex = currentIndex >= 0 ? currentIndex : 0;

    // Calculate scroll position to center the selected item
    const scrollOffset = validIndex * ITEM_HEIGHT - (VISIBLE_ITEMS - 1) * ITEM_HEIGHT * 0.5;

    // Handle wheel scroll
    const handleWheel = React.useCallback(
      (e: WheelEvent) => {
        if (disabled || !scrollRef.current) return;

        e.preventDefault();
        setIsScrolling(true);

        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        const direction = e.deltaY > 0 ? 1 : -1;
        const newIndex = Math.max(0, Math.min(SUPPORTED_LANGUAGES.length - 1, validIndex + direction));

        if (newIndex !== validIndex) {
          onChange(SUPPORTED_LANGUAGES[newIndex].code);
        }

        scrollTimeoutRef.current = setTimeout(() => {
          setIsScrolling(false);
        }, 150);
      },
      [validIndex, onChange, disabled]
    );

    // Handle touch/swipe
    const touchStartRef = React.useRef<number>(0);
    const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
      if (disabled) return;
      touchStartRef.current = e.touches[0].clientY;
    }, [disabled]);

    const handleTouchEnd = React.useCallback(
      (e: React.TouchEvent) => {
        if (disabled) return;

        const touchEnd = e.changedTouches[0].clientY;
        const diff = touchStartRef.current - touchEnd;

        if (Math.abs(diff) > 20) {
          const direction = diff > 0 ? 1 : -1;
          const newIndex = Math.max(0, Math.min(SUPPORTED_LANGUAGES.length - 1, validIndex + direction));

          if (newIndex !== validIndex) {
            onChange(SUPPORTED_LANGUAGES[newIndex].code);
          }
        }
      },
      [validIndex, onChange, disabled]
    );

    // Handle keyboard navigation
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

    // Attach wheel listener
    React.useEffect(() => {
      const element = scrollRef.current;
      if (!element) return;

      element.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        element.removeEventListener("wheel", handleWheel);
      };
    }, [handleWheel]);

    return (
      <div
        ref={ref}
        className={cn("relative w-full", className)}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="listbox"
        aria-label="Language selector"
      >
        {/* Container */}
        <div
          ref={containerRef}
          className="relative h-80 bg-gradient-to-b from-background/0 via-background to-background/0 rounded-lg overflow-hidden"
        >
          {/* Scroll area with languages */}
          <div
            ref={scrollRef}
            className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Spacer at top */}
            <div className="h-24 flex-shrink-0" />

            {/* Language items */}
            <motion.div
              className="relative space-y-0"
              animate={{
                y: -scrollOffset,
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
              }}
            >
              {SUPPORTED_LANGUAGES.map((language, index) => {
                const isSelected = language.code === value;
                return (
                  <motion.button
                    key={language.code}
                    onClick={() => !disabled && onChange(language.code)}
                    disabled={disabled}
                    className={cn(
                      "relative w-full h-14 flex items-center justify-start px-4 transition-all duration-200",
                      "hover:bg-accent/50 disabled:cursor-not-allowed",
                      isSelected && "bg-accent/30"
                    )}
                    whileHover={!disabled ? { scale: 1.02 } : {}}
                    whileTap={!disabled ? { scale: 0.98 } : {}}
                  >
                    {/* Language content */}
                    <div className="flex flex-col items-start flex-1">
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
            </motion.div>

            {/* Spacer at bottom */}
            <div className="h-24 flex-shrink-0" />
          </div>

          {/* Overlay gradients */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-background to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent" />
          </div>
        </div>

        {/* Left pointer indicator */}
        <motion.div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-14 bg-primary rounded-r-sm"
          animate={{
            top: `calc(50% + ${(validIndex - (VISIBLE_ITEMS - 1) * 0.5) * ITEM_HEIGHT}px)`,
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
          }}
        />

        {/* Center divider line */}
        <div className="absolute left-6 top-1/2 -translate-y-1/2 w-0.5 h-14 bg-border/30 rounded-full" />
      </div>
    );
  }
);

LanguageWheelPicker.displayName = "LanguageWheelPicker";

export { LanguageWheelPicker };
