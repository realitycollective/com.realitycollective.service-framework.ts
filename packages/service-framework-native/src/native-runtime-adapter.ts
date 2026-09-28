/**
 * A {@link RuntimeAdapter} for a native host, over the object the native app
 * installs as `globalThis.__rcHost`.
 *
 * The app owns the session and the frame loop. This adapter publishes them
 * through the same seam the IWSDK, three.js and Babylon.js adapters do, so a
 * service written against `RuntimeAdapter` runs unchanged on a native build.
 *
 * Capabilities are derived from the session info the app reports, the same
 * way the core's `deriveCapabilities` derives them from a WebXR session for
 * the IWSDK adapter: `handTracking` from the `"hand-tracking"` feature, or
 * `XR_EXT_hand_tracking` with system support, or a hand among the sources;
 * `planeDetection` from the `"plane-detection"` feature. They re-derive on
 * every session change AND on the input slice's source-change signal, as the
 * IWSDK adapter re-derives on `inputsourceschange`. `setCapabilities` layers
 * sticky overrides on top, as on every adapter.
 *
 * The adapter is also the native frame bridge, doing what IWSDK's
 * `ServiceBridgeSystem` does: services tick only while the session is
 * FOCUSED (a host frame outside focus is not passed on and does not count),
 * and, given a `manager`, it emits `emitFocusChange` and `emitPauseChange` on
 * every change of focus. Frame listeners and `renderTick` share one frame
 * count, carried on `FrameInfo.frame`.
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
import { getNativeHost, type NativeHost, type NativeSessionInfo, type NativeSessionRefusal } from "./native-host.js";

/** The two focus signals the adapter drives: a `ServiceManager` is one. */
export interface NativeFocusSink {
  emitFocusChange(focused: boolean): void;
  emitPauseChange(context: { readonly paused: boolean }): void;
}

export interface NativeRuntimeAdapterOptions {
  /** The host object. Defaults to `globalThis.__rcHost`. */
  readonly host?: NativeHost;
  /**
   * Given a scheduler, each focused host frame also emits the `renderTick`
   * channel with `source: "native"`, as the other bindings do for their loops.
   */
  readonly scheduler?: IScheduler;
  /**
   * The service manager whose focus and pause signals follow the session,
   * as `ServiceBridgeSystem`'s `manager` option does on IWSDK: both fire on
   * every change of focus, `paused` being `!focused`.
   */
  readonly manager?: NativeFocusSink;
}

/**
 * The states in which a session is live. `ready` counts, because the session
 * state is already `active` there: `immersive` and the state must agree.
 */
const LIVE_STATES: ReadonlySet<NativeSessionInfo["state"]> = new Set(["ready", "synchronized", "visible", "focused"]);

/**
 * The capabilities a native session info implies, before any override: the
 * core's `deriveCapabilities` over the native facts. `handSource` is whether
 * a hand is among the input sources right now.
 */
export function deriveNativeCapabilities(info: NativeSessionInfo, handSource = false): AdapterCapabilities {
  const live = LIVE_STATES.has(info.state);
  const blend = live ? info.blendMode : null;
  const features = info.features ?? [];
  const handExtension = info.systemHandTracking && info.extensions.includes("XR_EXT_hand_tracking");

  return {
    immersive: live,
    handTracking: live && (features.includes("hand-tracking") || handExtension || handSource),
    planeDetection: live && features.includes("plane-detection"),
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
  private readonly manager: NativeFocusSink | undefined;
  private readonly frameListeners = new Set<FrameListener>();
  private readonly capabilitiesListeners = new Set<CapabilitiesListener>();
  private readonly stateListeners = new Set<(state: SessionState) => void>();
  private readonly visibilityListeners = new Set<(visibility: SessionVisibility) => void>();
  private readonly hostSubscriptions: Array<() => void> = [];
  private info: NativeSessionInfo;
  private focused: boolean | undefined;
  private derived: AdapterCapabilities;
  private overrides: Partial<AdapterCapabilities> = {};
  private capabilities: AdapterCapabilities;
  private sessionState: SessionState = "none";
  private mode: SessionMode | null = null;
  private pendingMode: SessionMode | null = null;
  private visibility: SessionVisibility;
  private requesting = false;
  private pending: { readonly resolve: (result: SessionResult) => void; readonly timer: ReturnType<typeof setTimeout> } | undefined;
  /** Set only while an end-and-request switch is ending the live session. */
  private switchRefusal: ((reason: NativeSessionRefusal, detail?: string) => void) | undefined;
  private endWaiters: Array<() => void> = [];
  private frame = 0;

  public readonly session: SessionFacet = {
    getState: () => this.sessionState,
    getMode: () => (this.sessionState === "active" ? this.mode : null),
    isSupported: (mode) => this.checkSupported(mode),
    request: (mode, options) => this.request(mode, options),
    end: () => this.end(),
    recentre: () => this.host.recentre?.(),
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
    this.manager = options.manager;

    const info = this.host.getSessionInfo();
    this.info = info;
    this.derived = deriveNativeCapabilities(info, this.handSource());
    this.capabilities = this.derived;
    this.sessionState = toSessionState(info, false);
    this.visibility = toVisibility(info);

    this.hostSubscriptions.push(
      this.host.onFrame((timestampMs, deltaS) => this.handleHostFrame(timestampMs, deltaS)),
      this.host.onSessionChange((next) => this.handleSessionChange(next))
    );
    if (this.host.input) {
      this.hostSubscriptions.push(this.host.input.onSourcesChanged(() => this.refreshCapabilities()));
    }
    const refused = this.host.onSessionRefused?.((reason, detail) => this.handleRefusal(reason, detail));
    if (refused) {
      this.hostSubscriptions.push(refused);
    }
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

  /**
   * Push one frame to every subscriber. The host's focused frames arrive
   * here too, with their frame count.
   */
  public emitFrame(timestamp: number, delta: number, frame?: number): void {
    const info: FrameInfo = frame === undefined ? { timestamp, delta } : { timestamp, delta, frame };
    this.frameListeners.forEach((listener) => listener(info));
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

  /**
   * Re-read the session info and the sources from the host and re-derive.
   * The adapter does this itself on every session change and source change;
   * call it after the host changes something it has no signal for.
   */
  public refreshCapabilities(): void {
    this.info = this.host.getSessionInfo();
    this.derived = deriveNativeCapabilities(this.info, this.handSource());
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
    // ServiceBridgeSystem: signal a change of focus, and tick only while focused.
    this.updateFocus();
    if (!this.focused) {
      return;
    }

    this.frame += 1;
    this.emitFrame(timestampMs, deltaS, this.frame);

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
    this.info = info;
    const state = toSessionState(info, this.requesting);

    if (state === "active" && this.pending) {
      const pending = this.pending;
      this.pending = undefined;
      this.requesting = false;
      this.mode = this.pendingMode;
      this.pendingMode = null;
      clearTimeout(pending.timer);
      pending.resolve({ ok: true });
    }

    this.setState(state);
    this.derived = deriveNativeCapabilities(info, this.handSource());
    this.publishCapabilities();

    const visibility = toVisibility(info);

    if (visibility !== this.visibility) {
      this.visibility = visibility;
      this.visibilityListeners.forEach((listener) => listener(visibility));
    }

    this.updateFocus();

    if (state === "none") {
      this.settleEndWaiters();
    }
  }

  /** Whether a hand is among the input slice's sources right now. */
  private handSource(): boolean {
    return this.host.input?.sample?.().some((source) => source.kind === "hand") ?? false;
  }

  /** Emit focus and pause on a change of focus, as `ServiceBridgeSystem` does. */
  private updateFocus(): void {
    const focused = this.info.state === "focused";
    if (focused === this.focused) {
      return;
    }
    this.focused = focused;
    this.manager?.emitFocusChange(focused);
    this.manager?.emitPauseChange({ paused: !focused });
  }

  /** The app will not start the requested session: resolve with its reason now. */
  private handleRefusal(reason: NativeSessionRefusal, detail?: string): void {
    // A refusal raised while an end-and-request switch is ending the live
    // session means the app cannot end it on its own: report that through
    // this request instead, exactly as a refused request reports.
    const switchRefusal = this.switchRefusal;

    if (switchRefusal) {
      this.switchRefusal = undefined;
      switchRefusal(reason, detail);
      return;
    }

    const pending = this.pending;
    if (!pending) {
      return;
    }
    this.pending = undefined;
    this.pendingMode = null;
    this.requesting = false;
    clearTimeout(pending.timer);
    this.setState("none");
    pending.resolve(detail === undefined ? { ok: false, reason } : { ok: false, reason, error: new Error(detail) });
  }

  /** Answers `isSupported()` off the session info's `supportedModes` fact; never rejects. */
  private checkSupported(mode: SessionMode): Promise<boolean> {
    const modes = this.info.supportedModes;
    return Promise.resolve(modes ? modes.includes(mode) : mode !== "inline");
  }

  private request(mode: SessionMode, options?: SessionRequestOptions): Promise<SessionResult> {
    if (this.sessionState === "active") {
      if (this.mode === mode) {
        return Promise.resolve({ ok: true });
      }

      return this.requestWithSwitch(mode, options);
    }

    if (this.sessionState !== "none") {
      return Promise.resolve({ ok: false, reason: "error", error: new Error(`A session is already ${this.sessionState}.`) });
    }

    return this.beginRequest(mode, options);
  }

  private beginRequest(mode: SessionMode, options?: SessionRequestOptions): Promise<SessionResult> {
    return new Promise<SessionResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending = undefined;
        this.pendingMode = null;
        this.requesting = false;
        this.setState("none");
        resolve({ ok: false, reason: "timeout" });
      }, options?.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS);

      this.pending = { resolve, timer };
      this.pendingMode = mode;
      this.requesting = true;
      this.setState("requesting");
      this.host.requestSession(mode, JSON.stringify(options ?? {}));
    });
  }

  /**
   * End-and-request: end the live session, then request the new mode. Ends
   * first so a native `endSession()`, which reports no failure of its own,
   * still gets a chance to refuse through {@link NativeRuntimeAdapter.handleRefusal}
   * before the new request begins.
   */
  private requestWithSwitch(mode: SessionMode, options?: SessionRequestOptions): Promise<SessionResult> {
    return new Promise<SessionResult>((resolve) => {
      let settled = false;

      // Called at most once: it clears itself, so a later refusal takes the ordinary path.
      this.switchRefusal = (reason, detail) => {
        settled = true;
        this.switchRefusal = undefined;
        resolve(detail === undefined ? { ok: false, reason } : { ok: false, reason, error: new Error(detail) });
      };

      void this.end().then(() => {
        if (settled) {
          return;
        }

        settled = true;
        this.switchRefusal = undefined;
        resolve(this.beginRequest(mode, options));
      });
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

    if (next === "none") {
      this.mode = null;
    }

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
