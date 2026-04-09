"use client";

export function LoadingScreen({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="min-h-app-screen flex flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
