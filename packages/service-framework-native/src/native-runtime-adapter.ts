/**
 * A {@link RuntimeAdapter} for a native host, over the object the native app
 * installs as `globalThis.__rcHost`.
 *
 * The app owns the session and the frame loop. This adapter publishes them
 * through the same seam the IWSDK, three.js and Babylon.js adapters do, so a
 * service written against `RuntimeAdapter` runs unchanged on a native build.
 *
 * Capabilities are derived from the session info the app reports, the same
 * way the web adapters derive them from the WebXR session: `handTracking` is
 * true only when `XR_EXT_hand_tracking` is enabled and the system supports
 * it. `setCapabilities` layers sticky overrides on top, as on every adapter.
 */
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_SESSION_TIMEOUT_MS,
  type AdapterCapabilities,
  type CapabilitiesListener,
  type FrameInfo,
  type FrameListener,
  type IScheduler,
  type LifecycleContext,
  type RuntimeAdapter,
  type SessionFacet,
  type SessionMode,
  type SessionRequestOptions,
  type SessionResult,
  type SessionState,
  type SessionVisibility,
  type Unsubscribe
} from "@realitycollective/service-framework";
import { getNativeHost, type NativeHost, type NativeSessionInfo } from "./native-host.js";

export interface NativeRuntimeAdapterOptions {
  /** The host object. Defaults to `globalThis.__rcHost`. */
  readonly host?: NativeHost;
  /**
   * Given a scheduler, each host frame also emits the `renderTick` channel
   * with `source: "native"`, as the other bindings do for their loops.
   */
  readonly scheduler?: IScheduler;
}

const LIVE_STATES: ReadonlySet<NativeSessionInfo["state"]> = new Set(["synchronized", "visible", "focused"]);

/** The capabilities a native session info implies, before any override. */
export function deriveNativeCapabilities(info: NativeSessionInfo): AdapterCapabilities {
  const live = LIVE_STATES.has(info.state);
  const blend = live ? info.blendMode : null;

  return {
    immersive: live,
    handTracking: live && info.systemHandTracking && info.extensions.includes("XR_EXT_hand_tracking"),
    planeDetection: false,
    passthrough: blend !== null && blend !== "opaque",
    environmentBlendMode: blend
  };
}

function toSessionState(info: NativeSessionInfo, requesting: boolean): SessionState {
  if (info.state === "none" || info.state === "idle") {
    return requesting ? "requesting" : "none";
  }

  if (info.state === "stopping" || info.state === "exiting") {
    return "ending";
  }

  // "ready" is the moment the app begins the session, so it counts as active.
  return "active";
}

function toVisibility(info: NativeSessionInfo): SessionVisibility {
  switch (info.state) {
    case "focused":
      return "visible";
    case "visible":
      return "visible-blurred";
    case "synchronized":
      return "hidden";
    default:
      return "non-immersive";
  }
}

const CAPABILITY_KEYS = Object.keys(DEFAULT_CAPABILITIES) as Array<keyof AdapterCapabilities>;

export class NativeRuntimeAdapter implements RuntimeAdapter {
  private readonly host: NativeHost;
  private readonly scheduler: IScheduler | undefined;
  private readonly frameListeners = new Set<FrameListener>();
  private readonly capabilitiesListeners = new Set<CapabilitiesListener>();
  private readonly stateListeners = new Set<(state: SessionState) => void>();
  private readonly visibilityListeners = new Set<(visibility: SessionVisibility) => void>();
  private readonly hostSubscriptions: Array<() => void> = [];
  private derived: AdapterCapabilities;
  private overrides: Partial<AdapterCapabilities> = {};
  private capabilities: AdapterCapabilities;
  private sessionState: SessionState = "none";
  private visibility: SessionVisibility;
  private requesting = false;
  private pending: { readonly resolve: (result: SessionResult) => void; readonly timer: ReturnType<typeof setTimeout> } | undefined;
  private endWaiters: Array<() => void> = [];
  private frame = 0;

  public readonly session: SessionFacet = {
    getState: () => this.sessionState,
    request: (mode, options) => this.request(mode, options),
    end: () => this.end(),
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
    }
  };

  public constructor(options: NativeRuntimeAdapterOptions = {}) {
    this.host = getNativeHost(options.host);
    this.scheduler = options.scheduler;

    const info = this.host.getSessionInfo();
    this.derived = deriveNativeCapabilities(info);
    this.capabilities = this.derived;
    this.sessionState = toSessionState(info, false);
    this.visibility = toVisibility(info);

    this.hostSubscriptions.push(
      this.host.onFrame((timestampMs, deltaS) => this.handleHostFrame(timestampMs, deltaS)),
      this.host.onSessionChange((next) => this.handleSessionChange(next))
    );
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

  /** Push one frame to every subscriber. The host's frames arrive here too. */
  public emitFrame(timestamp: number, delta: number): void {
    const frame: FrameInfo = { timestamp, delta };
    this.frameListeners.forEach((listener) => listener(frame));
  }

  /**
   * Force capability flags regardless of what the session reports. Overrides
   * win for as long as they are set, survive every later derivation, and are
   * dropped only by {@link clearCapabilityOverrides} or {@link dispose}.
   * Subscribers are notified if the effective capabilities changed.
   */
  public setCapabilities(capabilities: Partial<AdapterCapabilities>): void {
    this.overrides = { ...this.overrides, ...capabilities };
    this.publishCapabilities();
  }

  /** Drop every manual override and fall back to the derived capabilities. */
  public clearCapabilityOverrides(): void {
    this.overrides = {};
    this.publishCapabilities();
  }

  /** Re-read the session info from the host and re-derive on demand. */
  public refreshCapabilities(): void {
    this.derived = deriveNativeCapabilities(this.host.getSessionInfo());
    this.publishCapabilities();
  }

  /**
   * Release everything the adapter holds: its host subscriptions, any
   * in-flight request or `end()`, the overrides and every subscriber. It does
   * not end the session; the app owns that decision.
   */
  public dispose(): void {
    for (const unsubscribe of this.hostSubscriptions) {
      unsubscribe();
    }

    this.hostSubscriptions.length = 0;

    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.resolve({ ok: false, reason: "error", error: new Error("The adapter was disposed.") });
      this.pending = undefined;
    }

    this.settleEndWaiters();
    this.overrides = {};
    this.frameListeners.clear();
    this.capabilitiesListeners.clear();
    this.stateListeners.clear();
    this.visibilityListeners.clear();
  }

  private handleHostFrame(timestampMs: number, deltaS: number): void {
    this.frame += 1;
    this.emitFrame(timestampMs, deltaS);

    if (this.scheduler) {
      // `FrameInfo.delta` is seconds; the scheduler's `LifecycleContext` is in
      // milliseconds, as every other binding emits it.
      const context: LifecycleContext = {
        timestamp: timestampMs,
        deltaTime: deltaS * 1000,
        frame: this.frame,
        source: "native"
      };
      this.scheduler.emit("renderTick", context);
    }
  }

  private handleSessionChange(info: NativeSessionInfo): void {
    const state = toSessionState(info, this.requesting);

    if (state === "active" && this.pending) {
      const pending = this.pending;
      this.pending = undefined;
      this.requesting = false;
      clearTimeout(pending.timer);
      pending.resolve({ ok: true });
    }

    this.setState(state);
    this.derived = deriveNativeCapabilities(info);
    this.publishCapabilities();

    const visibility = toVisibility(info);

    if (visibility !== this.visibility) {
      this.visibility = visibility;
      this.visibilityListeners.forEach((listener) => listener(visibility));
    }

    if (state === "none") {
      this.settleEndWaiters();
    }
  }

  private request(mode: SessionMode, options?: SessionRequestOptions): Promise<SessionResult> {
    if (this.sessionState === "active") {
      return Promise.resolve({ ok: true });
    }

    if (this.sessionState !== "none") {
      return Promise.resolve({ ok: false, reason: "error", error: new Error(`A session is already ${this.sessionState}.`) });
    }

    return new Promise<SessionResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending = undefined;
        this.requesting = false;
        this.setState("none");
        resolve({ ok: false, reason: "timeout" });
      }, options?.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS);

      this.pending = { resolve, timer };
      this.requesting = true;
      this.setState("requesting");
      this.host.requestSession(mode, JSON.stringify(options ?? {}));
    });
  }

  private end(): Promise<void> {
    if (this.sessionState === "none") {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.endWaiters.push(resolve);
      this.host.endSession();
    });
  }

  private setState(next: SessionState): void {
    if (next === this.sessionState) {
      return;
    }

    this.sessionState = next;
    this.stateListeners.forEach((listener) => listener(next));
  }

  private settleEndWaiters(): void {
    const waiters = this.endWaiters;
    this.endWaiters = [];
    waiters.forEach((resolve) => resolve());
  }

  private publishCapabilities(): void {
    const next: AdapterCapabilities = { ...this.derived, ...this.overrides };
    const changed = CAPABILITY_KEYS.some((key) => next[key] !== this.capabilities[key]);

    if (!changed) {
      return;
    }

    this.capabilities = next;
    this.capabilitiesListeners.forEach((listener) => listener(next));
  }
}
