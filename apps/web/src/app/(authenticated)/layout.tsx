"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { getPostAuthPath, isPathAllowedForStep } from "@/lib/auth-flow";
import { SearchProvider } from "@/contexts/search-context";
import { AppNav } from "@/components/navigation";
import { SidebarWidthProvider, useSidebarWidth } from "@/contexts/sidebar-width-context";
import { LoadingScreen } from "@/components/feedback";
import { EXPERIENCE_CARD_FAMILIES_QUERY_KEY } from "@/hooks/use-experience-card-families";
import { api } from "@/lib/api";
import { preloadVapiWeb } from "@/lib/vapi-client";
import type { SavedCardFamily } from "@/lib/types";

import type { ReactNode } from "react";

const CARD_FAMILIES_STALE_MS = 2 * 60 * 1000;

/** Prefetch card families + Vapi SDK on /cards* so enhance voice connects sooner. */
function CardsRouteWarmup() {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!pathname?.startsWith("/cards")) return;
    void preloadVapiWeb().catch(() => {});
    void queryClient.prefetchQuery({
      queryKey: EXPERIENCE_CARD_FAMILIES_QUERY_KEY,
      queryFn: () => api<SavedCardFamily[]>("/me/experience-card-families"),
      staleTime: CARD_FAMILIES_STALE_MS,
    });
  }, [pathname, queryClient]);

  return null;
}

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { isAuthenticated, onboardingStep, isAuthLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const requiredPath = getPostAuthPath(onboardingStep);
  const routeAllowed = isPathAllowedForStep(pathname, onboardingStep);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (onboardingStep != null && !routeAllowed) {
      router.replace(requiredPath);
    }
  }, [isAuthLoading, isAuthenticated, onboardingStep, requiredPath, routeAllowed, router]);

  if (isAuthLoading || !isAuthenticated || !routeAllowed) {
    return <LoadingScreen />;
  }

  return (
    <SearchProvider>
      <SidebarWidthProvider>
        <AuthenticatedLayoutBody>{children}</AuthenticatedLayoutBody>
      </SidebarWidthProvider>
    </SearchProvider>
  );
}

function AuthenticatedLayoutBody({ children }: { children: ReactNode }) {
  const { sidebarWidth } = useSidebarWidth();

  return (
    <div className="overflow-x-hidden">
      <CardsRouteWarmup />
      <Suspense fallback={null}>
        <AppNav />
      </Suspense>
      <div
        style={{ paddingLeft: sidebarWidth }}
        className="min-w-0 overflow-x-hidden h-[calc(100vh-3.5rem)]"
      >
        <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 h-full max-w-full overflow-x-hidden overflow-y-auto scrollbar-theme">
          {children}
        </main>
      </div>
    </div>
  );
}
