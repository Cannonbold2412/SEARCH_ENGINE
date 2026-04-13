/**
 * Detect Vapi Web SDK `message` events for the client-side `create_card` tool.
 *
 * The builder assistant calls `create_card` when it has gathered enough
 * information to commit an experience card. Shapes differ by Vapi dashboard
 * version, so we accept several variants (same approach as
 * `vapi-card-draft-messages.ts` for `update_card_draft`).
 */

const TOOL_NAME = "create_card";

function matchesToolName(name: unknown): boolean {
  return typeof name === "string" && name.toLowerCase() === TOOL_NAME;
}

/**
 * Returns `true` when the Vapi message event contains a `create_card` tool
 * invocation — signalling that the AI assistant decided enough information
 * has been gathered to commit the experience card.
 */
export function isCreateCardToolCall(msg: unknown): boolean {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  const t = String(m.type ?? "").toLowerCase().replace(/-/g, "_");

  if (t === "tool_calls" || t === "toolcalls") {
    const calls = (m.toolCalls ?? m.tool_calls ?? m.toolCallList) as unknown[] | undefined;
    for (const c of calls ?? []) {
      if (!c || typeof c !== "object") continue;
      const co = c as Record<string, unknown>;
      const fn = (co.function as Record<string, unknown>) || co;
      if (matchesToolName(fn.name ?? co.name)) return true;
    }
  }

  if (t === "function_call" || t === "functioncall") {
    if (matchesToolName(m.functionName ?? m.name)) return true;
  }

  if (matchesToolName(m.name)) return true;

  const fc = m.functionCall as Record<string, unknown> | undefined;
  if (fc && matchesToolName(fc.name)) return true;

  return false;
}
