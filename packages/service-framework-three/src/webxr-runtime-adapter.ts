/**
 * WebXR implementation of {@link RuntimeAdapter}, for a three.js app or any
 * other page that owns its own renderer.
 *
 * The IWSDK binding gets its adapter from IWSDK. Everything else - a plain
 * three.js app, a desktop build with no headset - had nothing, so a service
 * written against `RuntimeAdapter` could not be hosted there. This adapter
 * closes that gap: it orchestrates the entry points the platform already
 * provides (`navigator.xr` for session negotiation, `renderer.xr` for the
 * session the renderer presents, `setAnimationLoop` for frames) and publishes
 * them through the same seam. It renders nothing, plays nothing and owns no
 * scene state.
 *
 * Every host type here is structural, so this package still imports neither
 * `three` nor any WebXR type, and the adapter unit-tests headless.
 */
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_SESSION_TIMEOUT_MS,
  deriveCapabilities,
  mergeSessionInit,
  type AdapterCapabilities,
  type CapabilitiesListener,
  type CapabilitySessionLike,
  type FrameInfo,
  type FrameListener,
  type IScheduler,
  type LifecycleContext,
  type RuntimeAdapter,
  type SessionFacet,
  type SessionFailureReason,
  type SessionMode,
  type SessionRequestOptions,
  type SessionResult,
  type SessionState,
  type SessionVisibility,
  type Unsubscribe,
} from "@realitycollective/service-framework";
import { FIRST_FRAME_DELTA_MS, type AnimationLoopHostLike } from "./three-render-loop-bridge.js";

/** The events an `XRSession` raises that this adapter listens for. */
export type WebXRSessionEventType = "end" | "visibilitychange" | "inputsourceschange";

/** The events three.js's `WebXRManager` raises that this adapter listens for. */
export type WebXRManagerEventType = "sessionstart" | "sessionend";

/** Host event callback. The adapter reads the host, not the event object. */
export type WebXREventListener = (event?: unknown) => void;

/**
 * The slice of an `XRSession` the adapter reads. It extends the core's
 * {@link CapabilitySessionLike}, so a live session goes straight to
 * `deriveCapabilities` with no mapping.
 */
export interface WebXRSessionLike extends CapabilitySessionLike {
  /** Ends the session. The `end` event is what the adapter acts on. */
  end(): Promise<void>;
  /** `"visible"`, `"visible-blurred"` or `"hidden"` on a live session. */
  readonly visibilityState?: string;
  addEventListener(type: WebXRSessionEventType, listener: WebXREventListener): void;
  removeEventListener(type: WebXRSessionEventType, listener: WebXREventListener): void;
}

/** The slice of `navigator.xr` the session facet negotiates through. */
export interface WebXRSystemLike {
  isSessionSupported(mode: string): Promise<boolean>;
  requestSession(mode: string, init?: unknown): Promise<WebXRSessionLike>;
}

/** The slice of a three.js `renderer.xr` (`WebXRManager`) the adapter drives. */
export interface WebXRManagerLike {
  /** Hands the renderer the session it should present. */
  setSession(session: WebXRSessionLike): Promise<void> | void;
  /** The session the renderer is presenting, or null in 2D. */
  getSession(): WebXRSessionLike | null;
  addEventListener(type: WebXRManagerEventType, listener: WebXREventListener): void;
  removeEventListener(type: WebXRManagerEventType, listener: WebXREventListener): void;
}

export interface WebXRRuntimeAdapterOptions {
  /** `renderer.xr` - the renderer's WebXR manager. */
  readonly xr: WebXRManagerLike;
  /**
   * `navigator.xr`. Defaults to the global when omitted, and to `null` where
   * there is no global, which is what a Node test sees. A null system reports
   * every session request as `"unsupported"`.
   */
  readonly xrSystem?: WebXRSystemLike | null;
  /**
   * The renderer, or anything else with `setAnimationLoop`. Given one, the
   * adapter owns the loop: {@link WebXRRuntimeAdapter.start} binds it and each
   * callback becomes a frame. Omit it to drive frames yourself with
   * {@link WebXRRuntimeAdapter.emitFrame}.
   */
  readonly host?: AnimationLoopHostLike;
  /**
   * Given a scheduler, each owned frame also emits the `renderTick` channel
   * with `source: "three"`, exactly as `ThreeRenderLoopBridge` does, so an app
   * needs one loop owner rather than two.
   */
  readonly scheduler?: IScheduler;
  /**
   * Supplies the `XRSessionInit` for a mode - required and optional features.
   * Called once per request; the default sends no init at all.
   */
  readonly sessionInit?: (mode: SessionMode) => unknown;
}

type SessionStateListener = (state: SessionState) => void;
type SessionVisibilityListener = (visibility: SessionVisibility) => void;

const SESSION_VISIBILITY_VALUES: ReadonlySet<string> = new Set([
  "visible",
  "visible-blurred",
  "hidden",
]);

/**
 * Map `XRSession.visibilityState` onto the facet's vocabulary. An unrecognised
 * value is reported as `"hidden"`, because treating an unknown state as visible
 * would keep game logic running when it should not.
 */
function toSessionVisibility(value: unknown): SessionVisibility {
  if (typeof value === "string" && SESSION_VISIBILITY_VALUES.has(value)) {
    return value as SessionVisibility;
  }

  return "hidden";
}

/**
 * WebXR reports a blocked request through the error name: `NotAllowedError`
 * when the user or the permission prompt refused, `SecurityError` when the
 * permissions policy did. Both are a refusal rather than a fault.
 */
function toFailureReason(error: unknown): SessionFailureReason {
  const name = (error as { readonly name?: unknown } | null | undefined)?.name;

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "denied";
  }

  return "error";
}

/** `navigator.xr`, read defensively: there is no navigator in a Node test. */
function defaultXRSystem(): WebXRSystemLike | null {
  const globalNavigator = (globalThis as { navigator?: { xr?: WebXRSystemLike } }).navigator;

  return globalNavigator?.xr ?? null;
}

export class WebXRRuntimeAdapter implements RuntimeAdapter {
  private readonly frameListeners = new Set<FrameListener>();
  private readonly capabilitiesListeners = new Set<CapabilitiesListener>();
  private readonly stateListeners = new Set<SessionStateListener>();
  private readonly visibilityListeners = new Set<SessionVisibilityListener>();
  private readonly endWaiters = new Set<() => void>();

  private readonly xr: WebXRManagerLike;
  private readonly xrSystem: WebXRSystemLike | null;
  private readonly host: AnimationLoopHostLike | undefined;
  private readonly scheduler: IScheduler | undefined;
  private readonly sessionInit: ((mode: SessionMode) => unknown) | undefined;

  private derived: AdapterCapabilities = DEFAULT_CAPABILITIES;
  private overrides: Partial<AdapterCapabilities> = {};
  private capabilities: AdapterCapabilities = DEFAULT_CAPABILITIES;
  private sessionState: SessionState = "none";
  private boundSession: WebXRSessionLike | null = null;
  private sessionListeners: {
    readonly type: WebXRSessionEventType;
    readonly listener: WebXREventListener;
  }[] = [];
  private animationLoopBound = false;
  private frame = 0;
  private lastTimestamp = 0;

  private readonly onManagerSessionStart: WebXREventListener = () => {
    this.handleSessionStart();
  };

  private readonly onManagerSessionEnd: WebXREventListener = () => {
    this.handleSessionEnd();
  };

  /** Session lifecycle over `navigator.xr` and the renderer's XR manager. */
  public readonly session: SessionFacet = {
    getState: () => this.sessionState,
    request: (mode, options) => this.requestSession(mode, options),
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

  public constructor(options: WebXRRuntimeAdapterOptions) {
    this.xr = options.xr;
    this.xrSystem = options.xrSystem === undefined ? defaultXRSystem() : options.xrSystem;
    this.host = options.host;
    this.scheduler = options.scheduler;
    this.sessionInit = options.sessionInit;

    this.xr.addEventListener("sessionstart", this.onManagerSessionStart);
    this.xr.addEventListener("sessionend", this.onManagerSessionEnd);

    const session = this.xr.getSession();

    if (session) {
      this.attachSession(session);
      this.sessionState = "active";
    }

    this.derived = deriveCapabilities(session);
    this.capabilities = this.derived;
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

  /** The session the renderer is presenting, or null in 2D. */
  public getSession(): WebXRSessionLike | null {
    return this.boundSession;
  }

  /**
   * Bind the animation loop, if this adapter was given a host. Each callback
   * becomes one {@link FrameInfo} and, where a scheduler was supplied, one
   * `renderTick`. With no host this does nothing: the app owns the loop and
   * calls {@link WebXRRuntimeAdapter.emitFrame} itself.
   *
   * three.js routes `setAnimationLoop` through the session's own
   * `requestAnimationFrame` while presenting, so one call covers both the 2D
   * page and the headset.
   */
  public start(): void {
    if (this.animationLoopBound) {
      return;
    }

    this.animationLoopBound = true;
    this.host?.setAnimationLoop((timestamp) => this.handleAnimationFrame(timestamp));
  }

  /** Release the animation loop. Safe to call when it was never bound. */
  public stop(): void {
    if (!this.animationLoopBound) {
      return;
    }

    this.animationLoopBound = false;
    this.host?.setAnimationLoop(null);
  }

  /** Push one frame to every subscriber. Call this when you own the loop. */
  public emitFrame(timestamp: number, delta: number): void {
    const frame: FrameInfo = { timestamp, delta };
    this.frameListeners.forEach((listener) => listener(frame));
  }

  /**
   * Re-read the renderer's session and publish any capability change. The
   * adapter does this itself on every session and input-source event; call it
   * directly after the host enables a feature mid-session, or after a host that
   * raises no events changes what it presents.
   */
  public refreshCapabilities(): void {
    const session = this.xr.getSession();

    if (session) {
      this.attachSession(session);
      this.updateDerived(session);
      return;
    }

    if (this.boundSession) {
      this.handleSessionEnd();
      return;
    }

    this.updateDerived(null);
  }

  /**
   * Force capability flags regardless of what the session reports. Overrides
   * are a layer on top of the derived values: they win for as long as they are
   * set, survive every later derivation, and are dropped only by
   * {@link WebXRRuntimeAdapter.clearCapabilityOverrides} or
   * {@link WebXRRuntimeAdapter.dispose}.
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
   * Release everything the adapter holds: the animation loop, both sets of host
   * event listeners, any in-flight `end()`, the manual overrides and every
   * listener. It does not end the session - the app owns that decision.
   */
  public dispose(): void {
    this.stop();
    this.xr.removeEventListener("sessionstart", this.onManagerSessionStart);
    this.xr.removeEventListener("sessionend", this.onManagerSessionEnd);
    this.detachSession();
    this.settleEndWaiters();

    this.overrides = {};
    this.frameListeners.clear();
    this.capabilitiesListeners.clear();
    this.stateListeners.clear();
    this.visibilityListeners.clear();
  }

  private handleAnimationFrame(timestamp: number): void {
    const deltaMs =
      this.lastTimestamp === 0 ? FIRST_FRAME_DELTA_MS : timestamp - this.lastTimestamp;

    this.lastTimestamp = timestamp;
    this.frame += 1;

    // `FrameInfo.delta` is seconds; the scheduler's `LifecycleContext` is in
    // milliseconds, which is the unit `ThreeRenderLoopBridge` already emits.
    this.emitFrame(timestamp, deltaMs / 1000);

    const context: LifecycleContext = {
      timestamp,
      deltaTime: deltaMs,
      frame: this.frame,
      source: "three",
    };

    this.scheduler?.emit("renderTick", context);
  }

  /**
   * Subscribe to one session's own events. The listeners close over the session
   * they belong to, so nothing here has to re-check which session is live.
   */
  private attachSession(session: WebXRSessionLike): void {
    if (session === this.boundSession) {
      return;
    }

    this.detachSession();
    this.boundSession = session;
    this.sessionListeners = [
      { type: "end", listener: () => this.handleSessionEnd() },
      {
        type: "visibilitychange",
        listener: () => this.notifyVisibility(toSessionVisibility(session.visibilityState)),
      },
      { type: "inputsourceschange", listener: () => this.updateDerived(session) },
    ];

    for (const entry of this.sessionListeners) {
      session.addEventListener(entry.type, entry.listener);
    }
  }

  private detachSession(): void {
    const session = this.boundSession;

    if (!session) {
      return;
    }

    for (const entry of this.sessionListeners) {
      session.removeEventListener(entry.type, entry.listener);
    }

    this.sessionListeners = [];
    this.boundSession = null;
  }

  private handleSessionStart(): void {
    const session = this.xr.getSession();

    if (!session) {
      return;
    }

    this.attachSession(session);
    this.setSessionState("active");
    this.updateDerived(session);
    this.notifyVisibility(toSessionVisibility(session.visibilityState));
  }

  /**
   * One session ending raises both the session's `end` event and the manager's
   * `sessionend`, so this runs twice per session and is written to be
   * idempotent.
   */
  private handleSessionEnd(): void {
    if (!this.boundSession && this.sessionState === "none") {
      return;
    }

    this.detachSession();
    this.setSessionState("none");
    this.updateDerived(null);
    this.notifyVisibility("non-immersive");
    this.settleEndWaiters();
  }

  private updateDerived(session: CapabilitySessionLike | null): void {
    this.derived = deriveCapabilities(session);
    this.publishCapabilities();
  }

  private publishCapabilities(): void {
    const next: AdapterCapabilities = { ...this.derived, ...this.overrides };
    const current = this.capabilities;

    if (
      next.immersive === current.immersive &&
      next.handTracking === current.handTracking &&
      next.planeDetection === current.planeDetection &&
      next.passthrough === current.passthrough &&
      next.environmentBlendMode === current.environmentBlendMode
    ) {
      return;
    }

    this.capabilities = next;
    this.capabilitiesListeners.forEach((listener) => listener(next));
  }

  private async requestSession(
    mode: SessionMode,
    options?: SessionRequestOptions,
  ): Promise<SessionResult> {
    if (this.sessionState === "active") {
      return { ok: true };
    }

    const system = this.xrSystem;

    if (!system) {
      return { ok: false, reason: "unsupported" };
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
    this.setSessionState("requesting");

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<SessionResult>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), timeoutMs);
    });

    const result = await Promise.race([this.openSession(system, mode, options), timeout]);
    clearTimeout(timer);

    if (!result.ok) {
      this.setSessionState("none");
      return result;
    }

    this.setSessionState("active");
    return result;
  }

  /**
   * Negotiate the session and hand it to the renderer. Nothing here throws at
   * the caller: a headset that is absent, refused or broken is a normal runtime
   * condition, so every outcome comes back as a {@link SessionResult}.
   *
   * The request's own features are merged over the `sessionInit` hook's result
   * by the core's `mergeSessionInit`, so they add to the app's defaults rather
   * than replacing them. A request that names none passes the hook's result
   * through untouched.
   */
  private async openSession(
    system: WebXRSystemLike,
    mode: SessionMode,
    options?: SessionRequestOptions,
  ): Promise<SessionResult> {
    try {
      const supported = await system.isSessionSupported(mode);

      if (!supported) {
        return { ok: false, reason: "unsupported" };
      }

      const init = mergeSessionInit(this.sessionInit?.(mode), options);
      const session = await system.requestSession(mode, init);
      await this.xr.setSession(session);

      // A manager that raises `sessionstart` has already attached this session;
      // one that does not is attached here, so both host styles behave alike.
      this.attachSession(session);
      this.updateDerived(session);

      return { ok: true };
    } catch (error) {
      return { ok: false, reason: toFailureReason(error), error };
    }
  }

  private async endSession(): Promise<void> {
    const session = this.boundSession;

    if (!session) {
      return;
    }

    this.setSessionState("ending");

    const ended = new Promise<void>((resolve) => {
      this.endWaiters.add(resolve);
    });

    try {
      await session.end();
    } catch {
      // Ending is best effort. The `end` event, not this promise, is what the
      // adapter acts on, and a host that refuses still has to be reported.
    }

    // The event has normally arrived by now and this is a no-op. A host that
    // raises none would otherwise leave the caller waiting forever, so the
    // settled `end()` call is the fallback signal.
    this.handleSessionEnd();

    await ended;
  }

  private settleEndWaiters(): void {
    const waiters = Array.from(this.endWaiters);
    this.endWaiters.clear();
    waiters.forEach((resolve) => resolve());
  }

  private notifyVisibility(visibility: SessionVisibility): void {
    this.visibilityListeners.forEach((listener) => listener(visibility));
  }

  private setSessionState(state: SessionState): void {
    if (this.sessionState === state) {
      return;
    }

    this.sessionState = state;
    this.stateListeners.forEach((listener) => listener(state));
  }
}
