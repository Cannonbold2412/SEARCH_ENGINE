/**
 * Auth routing helpers and localStorage key constants.
 *
 * Onboarding flow:
 *   "bio"      → /onboarding/bio      (fill profile)
 *   "language" → /onboarding/language (select preferred language)
 *   "builder"  → /builder             (add experience cards)
 *   null       → /home                (fully onboarded)
 */
export type OnboardingStep = "bio" | "language" | "builder";
export const AUTH_TOKEN_KEY = "token";
export const ONBOARDING_STEP_KEY = "onboarding_step";
export const PENDING_ONBOARDING_STEP_KEY = "pending_onboarding_step";

/** JWT from localStorage (null when logged out or during SSR). */
export function readStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getPostAuthPath(step: OnboardingStep | null): string {
  if (step === "bio") return "/onboarding/bio";
  if (step === "language") return "/onboarding/language";
  if (step === "builder") return "/builder";
  return "/home";
}

export function isPathAllowedForStep(pathname: string, step: OnboardingStep | null): boolean {
  if (step == null) return true;
  if (step === "bio") return pathname === "/onboarding/bio";
  if (step === "language") return pathname === "/onboarding/language";
  if (step === "builder") return true;
  return pathname === getPostAuthPath(step);
}

export function readPendingOnboardingStep(): OnboardingStep | null {
  if (typeof window === "undefined") return null;
  const step = localStorage.getItem(PENDING_ONBOARDING_STEP_KEY);
  return step === "bio" || step === "language" || step === "builder" ? step : null;
}

export function setPendingOnboardingStep(step: OnboardingStep | null): void {
  if (typeof window === "undefined") return;
  if (step) localStorage.setItem(PENDING_ONBOARDING_STEP_KEY, step);
  else localStorage.removeItem(PENDING_ONBOARDING_STEP_KEY);
}
