"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { getPostAuthPath, isPathAllowedForStep, type OnboardingStep } from "@/lib/auth-flow";
import { SearchProvider } from "@/contexts/search-context";
import { AppNav } from "@/components/navigation";
import { SidebarWidthProvider, useSidebarWidth } from "@/contexts/sidebar-width-context";
import { LoadingScreen } from "@/components/feedback";
import { EXPERIENCE_CARD_FAMILIES_QUERY_KEY } from "@/hooks/use-experience-card-families";
import { api } from "@/lib/api";
import { preloadVapiWeb } from "@/lib/vapi-client";
import type { SavedCardFamily } from "@/lib/types";

import type { ReactNode } from "react";

/** Check if current step is an onboarding step that should hide the sidebar. */
function isOnboardingStep(step: OnboardingStep | null): boolean {
  return step === "bio" || step === "language";
}

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
        <AuthenticatedLayoutBody onboardingStep={onboardingStep}>{children}</AuthenticatedLayoutBody>
      </SidebarWidthProvider>
    </SearchProvider>
  );
}

function AuthenticatedLayoutBody({ children, onboardingStep }: { children: ReactNode; onboardingStep: OnboardingStep | null }) {
  const { sidebarWidth } = useSidebarWidth();
  const inOnboarding = isOnboardingStep(onboardingStep);
  const contentOffset = inOnboarding ? "0px" : `${sidebarWidth}px`;

  return (
    <div className="min-h-app-screen overflow-x-clip">
      <CardsRouteWarmup />
      {!inOnboarding && (
        <Suspense fallback={null}>
          <AppNav />
        </Suspense>
      )}
      <div
        style={{ ["--content-offset" as "--content-offset"]: contentOffset }}
        className={
          inOnboarding
            ? "min-w-0 min-h-app-screen"
            : "min-w-0 h-app-shell max-h-app-shell pl-0 md:pl-[var(--content-offset)]"
        }
      >
        <main
          className={
            inOnboarding
              ? "mx-auto flex h-full max-w-full items-start justify-center overflow-y-auto overflow-x-clip px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center sm:px-4 sm:py-6 scrollbar-theme"
              : "container mx-auto h-full max-w-full overflow-y-auto overflow-x-clip px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-6 scrollbar-theme"
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
