"use client";

/**
 * Background components for auth pages.
 * Provides subtle radial gradient and dot grid texture.
 */

export function AuthBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, hsl(var(--accent)) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}

export function DepthGrid() {
  return (
    <div
      className="absolute inset-0 opacity-[0.04] pointer-events-none"
      aria-hidden
      style={{
        backgroundImage:
          "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    />
  );
}
