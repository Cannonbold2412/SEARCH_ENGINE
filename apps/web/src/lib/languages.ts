export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag?: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "hi", name: "Hindi", nativeName: "हिंदी", flag: "🇮🇳" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", flag: "🇮🇳" },
  { code: "mr", name: "Marathi", nativeName: "मराठी", flag: "🇮🇳" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", flag: "🇮🇳" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", flag: "🇮🇳" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", flag: "🇮🇳" },
  { code: "ur", name: "Urdu", nativeName: "اردو", flag: "🇵🇰" },
];

export const DEFAULT_LANGUAGE_CODE = "en";

/**
 * Get the full language object by language code
 */
export function getLanguageByCode(code: string): Language | undefined {
  return SUPPORTED_LANGUAGES.find((lang) => lang.code === code);
}

/**
 * Get the English name of a language by its code
 */
export function getLanguageName(code: string): string | undefined {
  return getLanguageByCode(code)?.name;
}

/**
 * Get the native name of a language by its code
 */
export function getLanguageNativeName(code: string): string | undefined {
  return getLanguageByCode(code)?.nativeName;
}

/**
 * Check if a language code is valid
 */
export function isValidLanguageCode(code: string): boolean {
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === code);
}

/**
 * Get the index of a language by its code
 */
export function getLanguageIndex(code: string): number {
  return SUPPORTED_LANGUAGES.findIndex((lang) => lang.code === code);
}
