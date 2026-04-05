/**
 * Vapi dashboard assistant (no custom LLM / no backend proxy).
 * Create an assistant at https://dashboard.vapi.ai and paste IDs into .env.local.
 *
 * For multi-language support, configure per-language assistants (optional):
 *   NEXT_PUBLIC_VAPI_ASSISTANT_ID_HI=... (Hindi)
 *   NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID_HI=... (enhance flow)
 *
 * Falls back to NEXT_PUBLIC_VAPI_ASSISTANT_ID / NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID.
 *
 * Important: Next.js only replaces NEXT_PUBLIC_* in the client bundle when each
 * variable is referenced with a static property name. Dynamic `process.env[key]`
 * is undefined in the browser — always use explicit `process.env.NEXT_PUBLIC_...`
 * reads below.
 */

export function getVapiPublicKey(): string {
  return (process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ?? "").trim();
}

function languageSpecificBuilderAssistantId(languageCode: string): string {
  switch (languageCode.toUpperCase()) {
    case "EN":
      return (process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_EN ?? "").trim();
    case "HI":
      return (process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_HI ?? "").trim();
    case "BN":
      return (process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_BN ?? "").trim();
    case "MR":
      return (process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_MR ?? "").trim();
    case "TA":
      return (process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_TA ?? "").trim();
    case "TE":
      return (process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_TE ?? "").trim();
    case "KN":
      return (process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_KN ?? "").trim();
    case "UR":
      return (process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_UR ?? "").trim();
    default:
      return "";
  }
}

function languageSpecificEditAssistantId(languageCode: string): string {
  switch (languageCode.toUpperCase()) {
    case "EN":
      return (process.env.NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID_EN ?? "").trim();
    case "HI":
      return (process.env.NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID_HI ?? "").trim();
    case "BN":
      return (process.env.NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID_BN ?? "").trim();
    case "MR":
      return (process.env.NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID_MR ?? "").trim();
    case "TA":
      return (process.env.NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID_TA ?? "").trim();
    case "TE":
      return (process.env.NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID_TE ?? "").trim();
    case "KN":
      return (process.env.NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID_KN ?? "").trim();
    case "UR":
      return (process.env.NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID_UR ?? "").trim();
    default:
      return "";
  }
}

/** Builder / create-card assistant (e.g. `/builder` voice). */
export function getVapiAssistantId(languageCode: string = "en"): string {
  const specific = languageSpecificBuilderAssistantId(languageCode);
  if (specific) return specific;
  return (process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID ?? "").trim();
}

/** Enhance / edit existing card — separate Vapi assistant with `update_card_draft` client tool. */
export function getVapiEditAssistantId(languageCode: string = "en"): string {
  const specific = languageSpecificEditAssistantId(languageCode);
  if (specific) return specific;
  return (process.env.NEXT_PUBLIC_VAPI_EDIT_ASSISTANT_ID ?? "").trim();
}

export function isVapiVoiceConfigured(languageCode: string = "en"): boolean {
  return Boolean(getVapiPublicKey() && getVapiAssistantId(languageCode));
}

export function isVapiEditVoiceConfigured(languageCode: string = "en"): boolean {
  return Boolean(getVapiPublicKey() && getVapiEditAssistantId(languageCode));
}
