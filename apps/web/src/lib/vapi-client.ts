export type VapiClient = InstanceType<typeof import("@vapi-ai/web").default>;

type VapiLifecycleMethod = () => Promise<void>;

type VapiClientWithInternals = Record<string, unknown> & {
  __conxaPatched?: boolean;
  cleanup?: VapiLifecycleMethod;
  stop?: VapiLifecycleMethod;
};

let VapiCtor: typeof import("@vapi-ai/web").default | null = null;

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
  const mod = await import("@vapi-ai/web");
  VapiCtor = mod.default;
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

export async function createPatchedVapiClient(
  apiToken: string,
  apiBaseUrl?: string
): Promise<VapiClient> {
  await preloadVapiWeb();
  // `preloadVapiWeb()` guarantees this is populated.
  return patchVapiClient(new VapiCtor!(apiToken, apiBaseUrl));
}
