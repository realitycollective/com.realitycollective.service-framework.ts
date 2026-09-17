/**
 * Headless {@link RuntimeAdapter} for tests. Services run against this with no
 * engine, no WebXR and no headset; tests drive the loop by calling
 * {@link MockRuntimeAdapter.emitFrame}, refine gating with
 * {@link MockRuntimeAdapter.setCapabilities}, and drive session lifecycle with
 * the `simulate*` helpers.
 */
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_SESSION_TIMEOUT_MS,
  type AdapterCapabilities,
  type CapabilitiesListener,
  type FrameListener,
  type RuntimeAdapter,
  type SessionFacet,
  type SessionRequestOptions,
  type SessionResult,
  type SessionState,
  type SessionVisibility,
  type Unsubscribe,
} from "./runtime-adapter.js";

type SessionStateListener = (state: SessionState) => void;
type SessionVisibilityListener = (visibility: SessionVisibility) => void;

interface PendingRequest {
  readonly resolve: (result: SessionResult) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class MockRuntimeAdapter implements RuntimeAdapter {
  private readonly frameListeners = new Set<FrameListener>();
  private readonly capabilitiesListeners = new Set<CapabilitiesListener>();
  private readonly stateListeners = new Set<SessionStateListener>();
  private readonly visibilityListeners = new Set<SessionVisibilityListener>();
  private capabilities: AdapterCapabilities;
  private sessionState: SessionState = "none";
  private pendingRequest: PendingRequest | undefined;

  /**
   * In-memory session lifecycle. Nothing happens on its own: a request stays in
   * `"requesting"` until the test calls {@link MockRuntimeAdapter.simulateSessionStart}
   * or the timeout elapses, which is what makes the timing testable.
   */
  public readonly session: SessionFacet = {
    getState: () => this.sessionState,
    request: (_mode, options) => this.requestSession(options),
    end: () => this.endSession(),
    onStateChange: (listener) => {
      this.stateListeners.add(listener);
      return () => {
        this.stateListeners.delete(listener);
      };
    },
    onVisibilityChange: (listener) => {
      this.visibilityListeners.add(listener);
      return () => {
        this.visibilityListeners.delete(listener);
      };
    },
  };

  public constructor(capabilities: Partial<AdapterCapabilities> = {}) {
    this.capabilities = { ...DEFAULT_CAPABILITIES, ...capabilities };
  }

  public onFrame(listener: FrameListener): Unsubscribe {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  public getCapabilities(): AdapterCapabilities {
    return this.capabilities;
  }

  public onCapabilitiesChange(listener: CapabilitiesListener): Unsubscribe {
    this.capabilitiesListeners.add(listener);
    return () => {
      this.capabilitiesListeners.delete(listener);
    };
  }

  /** Refine capabilities in tests; notifies subscribers. */
  public setCapabilities(capabilities: Partial<AdapterCapabilities>): void {
    this.capabilities = { ...this.capabilities, ...capabilities };
    this.capabilitiesListeners.forEach((listener) => listener(this.capabilities));
  }

  /** Drive a frame in tests. */
  public emitFrame(timestamp = 0, delta = 1 / 72): void {
    this.frameListeners.forEach((listener) => listener({ timestamp, delta }));
  }

  /** Pretend the host handed over a session; settles a pending request as `ok`. */
  public simulateSessionStart(): void {
    this.setSessionState("active");
    const pending = this.pendingRequest;

    if (pending) {
      this.pendingRequest = undefined;
      clearTimeout(pending.timer);
      pending.resolve({ ok: true });
    }
  }

  /** Pretend the session went away, from the host side rather than via `end()`. */
  public simulateSessionEnd(): void {
    this.setSessionState("none");
  }

  /** Push a visibility value to `session.onVisibilityChange` subscribers. */
  public simulateVisibility(visibility: SessionVisibility): void {
    this.visibilityListeners.forEach((listener) => listener(visibility));
  }

  private requestSession(options?: SessionRequestOptions): Promise<SessionResult> {
    if (this.sessionState === "active") {
      return Promise.resolve({ ok: true });
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
    this.setSessionState("requesting");

    return new Promise<SessionResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequest = undefined;
        this.setSessionState("none");
        resolve({ ok: false, reason: "timeout" });
      }, timeoutMs);

      this.pendingRequest = { resolve, timer };
    });
  }

  private endSession(): Promise<void> {
    if (this.sessionState !== "none") {
      this.setSessionState("ending");
      this.setSessionState("none");
    }

    return Promise.resolve();
  }

  private setSessionState(state: SessionState): void {
    if (this.sessionState === state) {
      return;
    }

    this.sessionState = state;
    this.stateListeners.forEach((listener) => listener(state));
  }
}
