export type VapiClient = InstanceType<typeof import("@vapi-ai/web").default>;

type VapiLifecycleMethod = () => Promise<void>;

type VapiClientWithInternals = Record<string, unknown> & {
  __conxaPatched?: boolean;
  cleanup?: VapiLifecycleMethod;
  stop?: VapiLifecycleMethod;
};

let VapiCtor: typeof import("@vapi-ai/web").default | null = null;
let VapiCtorPromise: Promise<typeof import("@vapi-ai/web").default> | null = null;

/**
 * Daily.co allows only one embedded iframe per page. Serializes teardown so the next
 * `new Vapi()` runs after the previous client's `stop()` has finished.
 */
let vapiDailyTeardown: Promise<void> = Promise.resolve();

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    const nested = record.error;
    if (nested && typeof nested === "object") {
      const nestedRecord = nested as Record<string, unknown>;
      if (typeof nestedRecord.message === "string") return nestedRecord.message;
      if (typeof nestedRecord.msg === "string") return nestedRecord.msg;
    }
  }
  return String(error ?? "");
}

export function isBenignVapiDisconnectError(error: unknown): boolean {
  return /meeting ended due to ejection|meeting has ended|ejection/i.test(
    getErrorMessage(error)
  );
}

/**
 * Human-readable message from Vapi / Daily nested error shapes (same idea as builder chat).
 */
export function getVapiErrorMessage(error: unknown): string {
  const errObj = error as Record<string, unknown>;
  const topMsg = (error as { message?: string })?.message ?? "";
  const nested = errObj?.error as Record<string, unknown> | undefined;
  const nestedMessageObject = nested?.message as Record<string, unknown> | undefined;
  const nestedErrorObject = nested?.error as Record<string, unknown> | undefined;
  const nestedMsg =
    (typeof nested?.errorMsg === "string" && nested.errorMsg) ||
    (typeof nestedMessageObject?.msg === "string" && nestedMessageObject.msg) ||
    (typeof nestedErrorObject?.msg === "string" && nestedErrorObject.msg);
  const errMsg = topMsg || (typeof nestedMsg === "string" ? nestedMsg : "");
  return errMsg || getErrorMessage(error);
}

/**
 * Errors that often fire during intentional teardown (Strict Mode, navigation) or normal hang-up.
 * Do not surface these as user-visible "Voice error" banners.
 */
export function isBenignVapiClientError(error: unknown): boolean {
  if (isBenignVapiDisconnectError(error)) return true;
  const msg = getVapiErrorMessage(error).toLowerCase();
  if (/duplicate dailyiframe/i.test(msg)) return true;
  if (/meeting has ended|meeting ended|left the call|call ended|participant left/i.test(msg)) {
    return true;
  }
  const errObj = error as Record<string, unknown>;
  const errType = String(errObj?.type ?? "").toLowerCase();
  if (errType === "daily-error" && /meeting has ended/i.test(msg)) return true;
  return false;
}

function resetInternalState(client: VapiClientWithInternals) {
  client.started = false;
  client.hasEmittedCallEndedStatus = false;
  if (client.speakingTimeout) {
    clearTimeout(client.speakingTimeout as ReturnType<typeof setTimeout>);
  }
  client.speakingTimeout = null;
  client.call = null;
}

export function patchVapiClient(client: VapiClient): VapiClient {
  const internal = client as unknown as VapiClientWithInternals;
  if (internal.__conxaPatched) return client;
  internal.__conxaPatched = true;

  const originalCleanup =
    typeof internal.cleanup === "function" ? internal.cleanup.bind(client) : null;
  if (originalCleanup) {
    internal.cleanup = async () => {
      try {
        await originalCleanup();
      } catch (error) {
        if (!isBenignVapiDisconnectError(error)) {
          throw error;
        }
        resetInternalState(internal);
      }
    };
  }

  const originalStop =
    typeof internal.stop === "function" ? internal.stop.bind(client) : client.stop.bind(client);
  internal.stop = async () => {
    try {
      await originalStop();
    } catch (error) {
      if (!isBenignVapiDisconnectError(error)) {
        throw error;
      }
      resetInternalState(internal);
    }
  };

  return client;
}

let ejectionListenerInstalled = false;

/**
 * Preload the Vapi Web SDK chunk so the first `startVoice()` call
 * doesn't pay the dynamic-import cost.
 *
 * Safe to call multiple times (module import is cached by the bundler).
 */
export async function preloadVapiWeb(): Promise<void> {
  installEjectionSilencer();

  if (VapiCtor) return;
  if (!VapiCtorPromise) {
    VapiCtorPromise = import("@vapi-ai/web")
      .then((mod) => {
        VapiCtor = mod.default;
        return mod.default;
      })
      .catch((err) => {
        VapiCtorPromise = null;
        throw err;
      });
  }
  await VapiCtorPromise;
}

/**
 * Install a one-time global handler that prevents the benign Daily.co
 * "meeting ended due to ejection" rejection from reaching the console.
 * Safe to call multiple times — only installs once.
 */
export function installEjectionSilencer(): void {
  if (typeof window === "undefined" || ejectionListenerInstalled) return;
  ejectionListenerInstalled = true;
  window.addEventListener("unhandledrejection", (event) => {
    if (isBenignVapiDisconnectError(event.reason)) {
      event.preventDefault();
    }
  });
}

/**
 * End a Vapi session and wait for Daily iframe teardown. Prefer this over `client.stop()`
 * so the next `createPatchedVapiClient` does not race the previous embed.
 */
export async function stopVapiClient(client: VapiClient | null | undefined): Promise<void> {
  if (!client) return;
  const p = client.stop().catch((error) => {
    if (!isBenignVapiDisconnectError(error)) {
      console.warn("Vapi stop:", error);
    }
  });
  vapiDailyTeardown = vapiDailyTeardown.then(() => p).catch(() => {});
  await p;
}

/**
 * Vapi Web SDK with your dashboard **public** key (not the private API key).
 * Second arg was removed: we no longer proxy through our API for custom LLM.
 */
export async function createPatchedVapiClient(publicKey: string): Promise<VapiClient> {
  await preloadVapiWeb();
  await vapiDailyTeardown;
  return patchVapiClient(new VapiCtor!(publicKey));
}

// ---------------------------------------------------------------------------
// Eager call prewarm — start a Vapi call before the builder page mounts so
// the ~3s API + WebRTC setup overlaps with navigation/rendering.
// ---------------------------------------------------------------------------

type EagerPrewarm = {
  client: VapiClient;
  callStartFired: boolean;
  error: string | null;
  promise: Promise<void>;
};

let eagerPrewarm: EagerPrewarm | null = null;

/**
 * Begin a Vapi call eagerly (e.g. on nav click). Attaches minimal safety
 * handlers. The consuming hook adopts the client via `claimEagerPrewarm()`.
 *
 * Idempotent — only the first call triggers setup; subsequent calls are no-ops.
 */
export function startEagerBuilderPrewarm(publicKey: string, assistantId: string): void {
  if (eagerPrewarm) return;
  const pw: EagerPrewarm = { client: null as unknown as VapiClient, callStartFired: false, error: null, promise: Promise.resolve() };
  eagerPrewarm = pw;
  // Resolve `pw.promise` as soon as the client exists and `start()` is scheduled — do NOT
  // await `client.start()` here. Awaiting start blocks `claimEagerPrewarm()` for the full
  // Vapi/WebRTC connect handshake (~multi-second) before the builder hook can attach handlers,
  // which defeats the entire purpose of overlapping setup with navigation/render time.
  pw.promise = createPatchedVapiClient(publicKey)
    .then((client) => {
      pw.client = client;
      client.on("call-start", () => {
        pw.callStartFired = true;
      });
      client.on("error", (err: unknown) => {
        if (isBenignVapiDisconnectError(err)) return;
        const msg = getVapiErrorMessage(err);
        pw.error = msg || "Voice connection error";
        void stopVapiClient(client);
        if (eagerPrewarm === pw) eagerPrewarm = null;
      });
      void client.start(assistantId).catch((e: unknown) => {
        if (isBenignVapiDisconnectError(e)) return;
        pw.error = getVapiErrorMessage(e) || "Voice connection error";
        void stopVapiClient(client);
        if (eagerPrewarm === pw) eagerPrewarm = null;
      });
    })
    .catch(() => {
      if (eagerPrewarm === pw) eagerPrewarm = null;
    });
}

/**
 * Claim the eagerly prewarmed call. Returns null if no prewarm is in progress
 * or if it errored. Clears the singleton so it can't be claimed twice.
 */
export async function claimEagerPrewarm(): Promise<EagerPrewarm | null> {
  const pw = eagerPrewarm;
  if (!pw) return null;
  eagerPrewarm = null;
  await pw.promise;
  if (pw.error || !pw.client) return null;
  return pw;
}

/**
 * Discard any in-progress eager prewarm (e.g. user navigated away before mount).
 */
export function discardEagerPrewarm(): void {
  const pw = eagerPrewarm;
  if (!pw) return;
  eagerPrewarm = null;
  void pw.promise.then(() => {
    if (pw.client) void stopVapiClient(pw.client);
  });
}
