"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoading } from "@/components/feedback";
import { LanguageWheelPicker } from "@/components/ui/language-wheel-picker";
import { api, type ApiOptions } from "@/lib/api";
import { getLanguageNativeName } from "@/lib/languages";
import { useVisibility, VISIBILITY_QUERY_KEY } from "@/hooks";
import { useAuth } from "@/contexts/auth-context";
import type { PatchVisibilityRequest, VisibilitySettingsResponse } from "@/lib/types";

export default function OnboardingLanguagePage() {
  const router = useRouter();
  const { setOnboardingStep } = useAuth();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: visibility, isLoading } = useVisibility();
  
  // Initialize from server data, with "en" as fallback during loading
  const initialLanguage = visibility?.preferred_language ?? "en";
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  
  // Use server value until user makes a selection
  const currentLanguage = selectedLanguage ?? initialLanguage;

  const patchLanguage = useMutation({
    mutationFn: (body: PatchVisibilityRequest) =>
      api<VisibilitySettingsResponse>("/me/visibility", { method: "PATCH", body } as ApiOptions),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VISIBILITY_QUERY_KEY }),
    onError: (e: Error) => setServerError(e.message),
  });

  const handleContinue = async () => {
    setServerError(null);
    try {
      await patchLanguage.mutateAsync({ preferred_language: currentLanguage });
      setOnboardingStep("builder");
      router.push("/builder");
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Failed to save language preference");
    }
  };

  if (isLoading) {
    return <PageLoading message="Loading…" />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[540px] mx-auto py-8"
    >
      <Card className="glass border-border/50 shadow-xl glow-ring overflow-hidden">
        <CardHeader className="space-y-1.5 border-b border-border/50 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Globe className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-xl tracking-tight">Choose your language</CardTitle>
          <CardDescription>
            Select your preferred language for the CONXA experience. The AI assistant will speak to you in this language.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-6">
          {serverError && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {serverError}
            </div>
          )}

          <div className="h-80">
            <LanguageWheelPicker
              value={currentLanguage}
              onChange={setSelectedLanguage}
              disabled={patchLanguage.isPending}
            />
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Selected: <span className="font-medium text-foreground">{getLanguageNativeName(currentLanguage) || currentLanguage}</span>
            </p>
            
            <Button
              onClick={handleContinue}
              className="w-full sm:w-auto min-w-[200px]"
              size="lg"
              disabled={patchLanguage.isPending}
            >
              {patchLanguage.isPending ? "Saving..." : "Continue to Builder"}
            </Button>
            
            <p className="text-xs text-muted-foreground mt-4">
              You can change this anytime in Settings.
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
