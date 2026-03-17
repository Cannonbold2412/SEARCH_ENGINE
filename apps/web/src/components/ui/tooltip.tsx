"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const TooltipProvider = ({ children, delayDuration = 300 }: { children: React.ReactNode; delayDuration?: number }) => {
  return <>{children}</>;
};

const TooltipContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>({ open: false, setOpen: () => {} });

const Tooltip = ({ children, delayDuration = 300 }: { children: React.ReactNode; delayDuration?: number }) => {
  const [open, setOpen] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(true), delayDuration);
  };

  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    setOpen(false);
  };

  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} className="relative inline-flex">
        {children}
      </div>
    </TooltipContext.Provider>
  );
};

const TooltipTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ className, asChild, children, ...props }, ref) => {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ref,
      ...props,
    } as React.Attributes);
  }

  return (
    <button ref={ref} className={cn("inline-flex", className)} {...props}>
      {children}
    </button>
  );
});
TooltipTrigger.displayName = "TooltipTrigger";

const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { side?: "top" | "bottom" | "left" | "right" }
>(({ className, side = "top", style, ...props }, ref) => {
  const { open } = React.useContext(TooltipContext);

  const sideClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 px-2 py-1 text-xs font-medium text-white bg-foreground rounded-md whitespace-nowrap",
        "transition-all duration-150 ease-out",
        sideClasses[side],
        className
      )}
      style={{
        animation: "fade-in-up 0.15s ease-out",
        ...style,
      }}
      {...props}
    >
      {props.children}
      <span
        className={cn(
          "absolute w-2 h-2 bg-foreground rotate-45",
          side === "top" && "top-full left-1/2 -translate-x-1/2 -mt-1",
          side === "bottom" && "bottom-full left-1/2 -translate-x-1/2 -mb-1",
          side === "left" && "left-full top-1/2 -translate-y-1/2 -ml-1",
          side === "right" && "right-full top-1/2 -translate-y-1/2 -mr-1"
        )}
      />
    </div>
  );
});
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
