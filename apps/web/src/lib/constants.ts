/**
 * App-wide constants derived from environment variables.
 *
 * Set NEXT_PUBLIC_API_BASE_URL in .env.local (e.g. http://localhost:8000).
 * Falls back to http://localhost:8000 when running locally without the env var.
 */
const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? "";
const isLocal =
  typeof window !== "undefined" && window.location?.hostname === "localhost";

/** Base URL for all API requests (no trailing slash). */
export const API_BASE = fromEnv || (isLocal ? "http://localhost:8000" : "");
