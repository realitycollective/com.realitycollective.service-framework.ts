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
  type SessionMode,
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

/** The immersive modes a fresh {@link MockRuntimeAdapter} reports as supported. */
const DEFAULT_SUPPORTED_MODES: readonly SessionMode[] = ["immersive-vr", "immersive-ar"];

export interface MockRuntimeAdapterOptions {
  /**
   * The modes {@link MockRuntimeAdapter.session}'s `isSupported` reports as
   * available. Defaults to both immersive modes; `"inline"` is unsupported
   * unless named here.
   */
  readonly supportedModes?: readonly SessionMode[];
}

export class MockRuntimeAdapter implements RuntimeAdapter {
  private readonly frameListeners = new Set<FrameListener>();
  private readonly capabilitiesListeners = new Set<CapabilitiesListener>();
  private readonly stateListeners = new Set<SessionStateListener>();
  private readonly visibilityListeners = new Set<SessionVisibilityListener>();
  private readonly supportedModes: ReadonlySet<SessionMode>;
  private capabilities: AdapterCapabilities;
  private sessionState: SessionState = "none";
  private mode: SessionMode | null = null;
  /** The mode a request in flight will adopt once the host hands it over. */
  private requestedMode: SessionMode | null = null;
  private pendingRequest: PendingRequest | undefined;

  /** How many times {@link MockRuntimeAdapter.session}'s `recentre` was called. */
  public recentreCount = 0;

  /**
   * In-memory session lifecycle. Nothing happens on its own: a request stays in
   * `"requesting"` until the test calls {@link MockRuntimeAdapter.simulateSessionStart}
   * or the timeout elapses, which is what makes the timing testable.
   */
  public readonly session: SessionFacet = {
    getState: () => this.sessionState,
    getMode: () => (this.sessionState === "active" ? this.mode : null),
    isSupported: (mode) => Promise.resolve(this.supportedModes.has(mode)),
    request: (mode, options) => this.requestSession(mode, options),
    end: () => this.endSession(),
    recentre: () => {
      this.recentreCount += 1;
    },
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

  public constructor(
    capabilities: Partial<AdapterCapabilities> = {},
    options: MockRuntimeAdapterOptions = {},
  ) {
    this.capabilities = { ...DEFAULT_CAPABILITIES, ...capabilities };
    this.supportedModes = new Set(options.supportedModes ?? DEFAULT_SUPPORTED_MODES);
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
    const pending = this.pendingRequest;
    this.mode = this.requestedMode ?? this.mode;
    this.setSessionState("active");

    if (pending) {
      this.pendingRequest = undefined;
      this.requestedMode = null;
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

  private requestSession(mode: SessionMode, options?: SessionRequestOptions): Promise<SessionResult> {
    if (this.sessionState === "active") {
      if (this.mode === mode) {
        return Promise.resolve({ ok: true });
      }

      // End-and-request: an in-memory host can always end, so the switch
      // happens synchronously, in the same tick, exactly as ending then
      // requesting would.
      this.setSessionState("ending");
      this.setSessionState("none");
      this.mode = null;
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
    this.requestedMode = mode;
    this.setSessionState("requesting");

    return new Promise<SessionResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequest = undefined;
        this.requestedMode = null;
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
      this.mode = null;
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
