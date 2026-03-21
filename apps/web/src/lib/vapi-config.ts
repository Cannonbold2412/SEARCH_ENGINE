/**
 * Vapi dashboard assistant (no custom LLM / no backend proxy).
 * Create an assistant at https://dashboard.vapi.ai and paste IDs into .env.local.
 */

export function getVapiPublicKey(): string {
  return (process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ?? "").trim();
}

export function getVapiAssistantId(): string {
  return (process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID ?? "").trim();
}

export function isVapiVoiceConfigured(): boolean {
  return Boolean(getVapiPublicKey() && getVapiAssistantId());
}
