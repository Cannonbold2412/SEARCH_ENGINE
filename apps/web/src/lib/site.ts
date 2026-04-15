/**
 * Canonical public site origin for sitemaps, llm.txt, canonical URLs, and robots.
 * Override in staging/preview via NEXT_PUBLIC_SITE_URL (no trailing slash).
 */
const DEFAULT_SITE_ORIGIN = "https://www.conxa.in";

function normalizeSiteOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_SITE_ORIGIN;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

export function getSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return normalizeSiteOrigin(fromEnv || DEFAULT_SITE_ORIGIN);
}

/** Join site origin with a path that starts with `/`. */
export function absoluteUrl(path: string): string {
  const origin = getSiteOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${p}`;
}

export const SUPPORT_EMAIL = "noreplay@conxa.in";
