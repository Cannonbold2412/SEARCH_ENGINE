/**
 * App-wide constants derived from environment variables.
 *
 * Set NEXT_PUBLIC_API_BASE_URL in .env.local (e.g. http://localhost:8000).
 * Falls back to http://localhost:8000 when running locally without the env var.
 */
function normalizePublicApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

const fromEnv = normalizePublicApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL ?? "");
const isLocal =
  typeof window !== "undefined" && window.location?.hostname === "localhost";

/** Base URL for all API requests (no trailing slash). */
export const API_BASE = fromEnv || (isLocal ? "http://localhost:8000" : "");

export function apiAssetUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}
