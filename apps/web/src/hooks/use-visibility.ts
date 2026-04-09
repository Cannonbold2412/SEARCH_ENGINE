import { useQuery } from "@tanstack/react-query";
import { readStoredAuthToken } from "@/lib/auth-flow";
import { api } from "@/lib/api";
import type { VisibilitySettingsResponse } from "@/lib/types";

export const VISIBILITY_QUERY_KEY = ["visibility"] as const;

/** Full React Query key for `/me/visibility` (includes session so login gets a fresh cache). */
export function visibilityQueryKey(token: string | null = readStoredAuthToken()) {
  return [...VISIBILITY_QUERY_KEY, token ?? ""] as const;
}

const defaultVisibility: VisibilitySettingsResponse = {
  open_to_work: false,
  open_to_contact: false,
  work_preferred_locations: [],
  work_preferred_salary_min: null,
  preferred_language: "en",
};

export function useVisibility() {
  const token = readStoredAuthToken();

  return useQuery({
    queryKey: visibilityQueryKey(token),
    queryFn: () => api<VisibilitySettingsResponse>("/me/visibility"),
    enabled: Boolean(token),
  });
}

export { defaultVisibility };
