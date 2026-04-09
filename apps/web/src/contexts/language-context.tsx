"use client";

import { createContext, useContext, useCallback, useMemo, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useVisibility, VISIBILITY_QUERY_KEY, visibilityQueryKey } from "@/hooks";
import { readStoredAuthToken } from "@/lib/auth-flow";
import { api } from "@/lib/api";
import { DEFAULT_LANGUAGE_CODE, isValidLanguageCode } from "@/lib/languages";
import type { PatchVisibilityRequest, VisibilitySettingsResponse } from "@/lib/types";

interface LanguageContextType {
  /** Current preferred language code (e.g., 'en', 'hi') */
  language: string;
  /** Whether language data is loading */
  isLoading: boolean;
  /** Update the preferred language */
  setLanguage: (code: string) => Promise<void>;
  /** Whether a language update is in progress */
  isUpdating: boolean;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

const DEFAULT_LANGUAGE = DEFAULT_LANGUAGE_CODE ?? "en";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { data: visibility, isLoading } = useVisibility();
  const queryClient = useQueryClient();

  const patchLanguage = useMutation({
    mutationFn: (body: PatchVisibilityRequest) =>
      api<VisibilitySettingsResponse>("/me/visibility", { method: "PATCH", body }),
    onMutate: async (body: PatchVisibilityRequest) => {
      const key = visibilityQueryKey(readStoredAuthToken());
      await queryClient.cancelQueries({ queryKey: VISIBILITY_QUERY_KEY });
      const previous = queryClient.getQueryData<VisibilitySettingsResponse>(key);

      if (previous && body.preferred_language) {
        queryClient.setQueryData(key, {
          ...previous,
          preferred_language: body.preferred_language,
        });
      }

      return { previous, key };
    },
    onError: (_err, _body, context) => {
      if (context?.previous != null && context.key) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: VISIBILITY_QUERY_KEY });
      // Localized API payloads were cached under the old language; force refetch.
      queryClient.invalidateQueries({ queryKey: ["me", "unlocked-cards"] });
      queryClient.invalidateQueries({ queryKey: ["people", "explore"] });
      queryClient.invalidateQueries({ queryKey: ["person"] });
      queryClient.invalidateQueries({ queryKey: ["search"] });
    },
  });

  const setLanguage = useCallback(
    async (code: string) => {
      if (!isValidLanguageCode(code)) {
        console.warn(`Invalid language code: ${code}`);
        return;
      }
      await patchLanguage.mutateAsync({ preferred_language: code });
    },
    [patchLanguage]
  );

  const language = visibility?.preferred_language ?? DEFAULT_LANGUAGE;

  const value = useMemo(
    () => ({
      language,
      isLoading,
      setLanguage,
      isUpdating: patchLanguage.isPending,
    }),
    [language, isLoading, setLanguage, patchLanguage.isPending]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return ctx;
}
