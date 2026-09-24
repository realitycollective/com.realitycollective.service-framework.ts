/**
 * The part of `AbortController` the service manager uses: a signal handed to
 * each service, and `abort()` when the service is disposed.
 */
export interface AbortControllerLike {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}

type AbortListener = (event: { readonly type: "abort" }) => void;

/**
 * A minimal signal for hosts with no `AbortController`, such as Hermes. It
 * carries `aborted`, `reason`, `onabort`, `addEventListener("abort")` and
 * `removeEventListener`, which is the surface a service is expected to read.
 */
class FallbackAbortSignal {
  public aborted = false;
  public reason: unknown = undefined;
  public onabort: AbortListener | null = null;
  private readonly listeners = new Set<AbortListener>();

  public addEventListener(type: string, listener: AbortListener): void {
    if (type === "abort") {
      this.listeners.add(listener);
    }
  }

  public removeEventListener(type: string, listener: AbortListener): void {
    if (type === "abort") {
      this.listeners.delete(listener);
    }
  }

  /** Fires once. A second call leaves the first reason in place. */
  public dispatchAbort(reason: unknown): void {
    if (this.aborted) {
      return;
    }

    this.aborted = true;
    this.reason = reason ?? new Error("This operation was aborted.");
    const event = { type: "abort" } as const;
    this.onabort?.(event);

    for (const listener of [...this.listeners]) {
      listener(event);
    }

    this.listeners.clear();
  }
}

class FallbackAbortController implements AbortControllerLike {
  private readonly fallbackSignal = new FallbackAbortSignal();

  public get signal(): AbortSignal {
    return this.fallbackSignal as unknown as AbortSignal;
  }

  public abort(reason?: unknown): void {
    this.fallbackSignal.dispatchAbort(reason);
  }
}

/**
 * The host's `AbortController` when it has one, otherwise the minimal
 * fallback above. Resolved on every call, so a host that installs the global
 * late still gets the real one.
 */
export function createAbortController(): AbortControllerLike {
  const Native = (globalThis as { AbortController?: new () => AbortControllerLike }).AbortController;
  return Native ? new Native() : new FallbackAbortController();
}
