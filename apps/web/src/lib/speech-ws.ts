import { API_BASE } from "./constants";

/** WebSocket URL for live STT (Deepgram via API proxy). Empty if API base is unset. */
export function getSpeechWebSocketUrl(): string {
  const base = API_BASE.trim();
  if (!base.startsWith("http://") && !base.startsWith("https://")) return "";
  if (base.startsWith("https://")) return `wss://${base.slice(8)}/speech/stream`;
  return `ws://${base.slice(7)}/speech/stream`;
}
