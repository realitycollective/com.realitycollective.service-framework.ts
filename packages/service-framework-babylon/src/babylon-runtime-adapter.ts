/**
 * Babylon.js implementation of {@link RuntimeAdapter}, for an app that owns a
 * Babylon `Engine` and a `WebXRDefaultExperience`.
 *
 * The IWSDK binding gets its adapter from IWSDK and the three.js binding builds
 * one over `navigator.xr`. A Babylon app had the render-loop bridge and nothing
 * else, so a service written against `RuntimeAdapter` could not be hosted
 * there. This adapter closes that gap: it orchestrates the entry points Babylon
 * already provides - the experience helper for session negotiation, the session
 * manager for the live `XRSession`, `runRenderLoop` for frames - and publishes
 * them through the same seam. It renders nothing, plays nothing and owns no
 * scene state.
 *
 * Every host type here is structural, so this package imports `@babylonjs/core`
 * nowhere and the adapter unit-tests headless. The shapes are written from the
 * Babylon 7 API and are not checked against an installed package, so anything a
 * version might move, rename or drop - the session manager, the observables,
 * the support check - is optional and read through a guard. An experience that
 * carries none of them still constructs and still reports what it can.
 *
 * Given a `host` and a `manager`, the owned render loop also gates on the live
 * session's visibility, as IWSDK's `ServiceBridgeSystem` and the native
 * adapter do: while a session is live, frames and `renderTick` flow only on
 * `"visible"`, `emitFocusChange`/`emitPauseChange` fire on every change, and
 * the frame count skips a gated tick. Unlike IWSDK and native, this adapter
 * also serves a desktop page with no session at all, and gating never applies
 * there - a plain Babylon page keeps ticking exactly as it did before this
 * existed.
 *
 * That whole step - the gate, the focus/pause signals, the frame count,
 * `emitFrame` and `renderTick` - lives in one place, {@link
 * BabylonRuntimeAdapter.tick}, which `start()` binds to the owned loop. A host
 * that owns its OWN render loop and will never call `start()` calls
 * `tick()` by hand from its own per-frame hook instead, and gets the
 * identical gate rather than reimplementing it.
 */
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_SESSION_TIMEOUT_MS,
  deriveCapabilities,
  mergeSessionInit,
  recentreRig,
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
import { FIRST_FRAME_DELTA_MS, type BabylonEngineHostLike } from "./babylon-render-loop-bridge.js";

/** The events an `XRSession` raises that this adapter listens for. */
export type BabylonXRSessionEventType = "end" | "visibilitychange" | "inputsourceschange";

/** Session event callback. The adapter reads the session, not the event. */
export type BabylonXREventListener = (event?: unknown) => void;

/**
 * The two focus signals the adapter drives while a session is live: a
 * `ServiceManager` is one. Declared locally, as `NativeFocusSink` is in the
 * native package, rather than shared, because the two packages do not depend
 * on each other.
 */
export interface BabylonFocusSink {
  emitFocusChange(focused: boolean): void;
  emitPauseChange(context: { readonly paused: boolean }): void;
}

/**
 * The handle a Babylon `Observable` hands back from `add`. The adapter only
 * stores it and gives it back to `remove`, so its shape is irrelevant here.
 */
export type BabylonObserverLike = object;

/** The slice of a Babylon `Observable<T>` the adapter subscribes through. */
export interface BabylonObservableLike<T> {
  add(callback: (value: T) => void): BabylonObserverLike | null;
  remove(observer: BabylonObserverLike | null): boolean;
}

/**
 * The slice of the raw `XRSession` Babylon exposes. It extends the core's
 * {@link CapabilitySessionLike}, so a live session goes straight to
 * `deriveCapabilities` with no mapping.
 *
 * This is the same WebXR object the three.js binding types as
 * `WebXRSessionLike`. The two engine packages do not depend on each other, so
 * the shape is declared once per package rather than shared.
 */
export interface BabylonXRSessionLike extends CapabilitySessionLike {
  /** `"visible"`, `"visible-blurred"` or `"hidden"` on a live session. */
  readonly visibilityState?: string;
  addEventListener(type: BabylonXRSessionEventType, listener: BabylonXREventListener): void;
  removeEventListener(type: BabylonXRSessionEventType, listener: BabylonXREventListener): void;
}

/** The slice of Babylon's `WebXRSessionManager` the adapter reads. */
export interface BabylonSessionManagerLike {
  /** The live session, or null/undefined outside XR. */
  readonly session?: BabylonXRSessionLike | null;
  readonly onXRSessionInit?: BabylonObservableLike<BabylonXRSessionLike>;
  readonly onXRSessionEnded?: BabylonObservableLike<unknown>;
  isSessionSupportedAsync?(sessionMode: string): Promise<boolean>;
}

/** A `Vector3`-shaped position, in metres. */
export interface BabylonVector3Like {
  x: number;
  y: number;
  z: number;
}

/** A `Quaternion`-shaped orientation. */
export interface BabylonQuaternionLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * The slice of a Babylon `WebXRCamera` `recentre()` reads and writes.
 * `position`/`rotationQuaternion` are the rig's own world transform;
 * `devicePosition`/`deviceRotationQuaternion` are the device's (the head's)
 * pose local to that rig, read-only from here - `recentre()` never writes
 * them.
 */
export interface BabylonXRCameraLike {
  position: BabylonVector3Like;
  rotationQuaternion: BabylonQuaternionLike;
  readonly devicePosition: BabylonVector3Like;
  readonly deviceRotationQuaternion: BabylonQuaternionLike;
}

/**
 * The slice of Babylon's `WebXRExperienceHelper` the adapter drives - that is,
 * `WebXRDefaultExperience.baseExperience`.
 */
export interface BabylonXRExperienceLike {
  /**
   * The helper's own state, one of {@link BABYLON_WEBXR_STATE}. The adapter
   * tracks state through `onStateChangedObservable` rather than polling this,
   * and names it here so a consumer reading the same shape has it.
   */
  readonly state?: number;
  readonly onStateChangedObservable?: BabylonObservableLike<number>;
  readonly sessionManager?: BabylonSessionManagerLike;
  /** The XR camera - `recentre()`'s read and write. Absent on an older Babylon. */
  readonly camera?: BabylonXRCameraLike;
  enterXRAsync(
    sessionMode: string,
    referenceSpaceType: string,
    renderTarget?: unknown,
    sessionCreationOptions?: unknown,
  ): Promise<unknown>;
  exitXRAsync(): Promise<void>;
}

/**
 * Babylon's `WebXRState` enum, mirrored as a plain const so a consumer can read
 * the adapter's state handling without importing `@babylonjs/core`. The values
 * are Babylon 7's, and are what `onStateChangedObservable` reports.
 */
export const BABYLON_WEBXR_STATE = {
  ENTERING_XR: 0,
  EXITING_XR: 1,
  IN_XR: 2,
  NOT_IN_XR: 3,
} as const;

export type BabylonWebXRState = (typeof BABYLON_WEBXR_STATE)[keyof typeof BABYLON_WEBXR_STATE];

/** The reference space a session is requested with when none is configured. */
export const DEFAULT_REFERENCE_SPACE_TYPE = "local-floor";

export interface BabylonRuntimeAdapterOptions {
  /**
   * `WebXRDefaultExperience.baseExperience`. Omit it, or pass null, on a build
   * with no XR at all: every session request then reports `"unsupported"` and
   * capabilities stay at the all-false defaults.
   */
  readonly xr?: BabylonXRExperienceLike | null;
  /**
   * The Babylon `Engine`, or anything else with `runRenderLoop`. Given one, the
   * adapter owns the loop: {@link BabylonRuntimeAdapter.start} binds it and
   * each callback becomes a frame. Omit it to drive frames yourself with
   * {@link BabylonRuntimeAdapter.emitFrame}.
   */
  readonly host?: BabylonEngineHostLike;
  /**
   * Given a scheduler, each owned frame also emits the `renderTick` channel
   * with `source: "babylon"`, exactly as `BabylonRenderLoopBridge` does, so an
   * app needs one loop owner rather than two.
   */
  readonly scheduler?: IScheduler;
  /** The reference space to enter with. Defaults to `"local-floor"`. */
  readonly referenceSpaceType?: string;
  /**
   * Supplies the `XRSessionInit` for a mode - required and optional features.
   * Called once per request; the default sends no init at all.
   */
  readonly sessionInit?: (mode: SessionMode) => unknown;
  /**
   * The service manager whose focus and pause signals follow the session's
   * visibility, as `ServiceBridgeSystem`'s `manager` option does on IWSDK and
   * the native adapter's `manager` option does on a native host: both fire on
   * every change of focus, `paused` being `!focused`. Gated ONLY while a
   * session is live - `XRSession.visibilityState` via `visibilitychange` -
   * because unlike IWSDK and native, this adapter also serves a desktop page
   * with no session at all, and that page keeps ticking exactly as it did
   * before this option existed.
   */
  readonly manager?: BabylonFocusSink;
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
 * permissions policy did. Both are a refusal rather than a fault, and Babylon
 * passes the browser's rejection straight through `enterXRAsync`.
 */
function toFailureReason(error: unknown): SessionFailureReason {
  const name = (error as { readonly name?: unknown } | null | undefined)?.name;

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "denied";
  }

  return "error";
}

export class BabylonRuntimeAdapter implements RuntimeAdapter {
  private readonly frameListeners = new Set<FrameListener>();
  private readonly capabilitiesListeners = new Set<CapabilitiesListener>();
  private readonly stateListeners = new Set<SessionStateListener>();
  private readonly visibilityListeners = new Set<SessionVisibilityListener>();
  private readonly endWaiters = new Set<() => void>();
  private readonly observerDetachers: (() => void)[] = [];

  private readonly xr: BabylonXRExperienceLike | null;
  private readonly host: BabylonEngineHostLike | undefined;
  private readonly scheduler: IScheduler | undefined;
  private readonly referenceSpaceType: string;
  private readonly sessionInit: ((mode: SessionMode) => unknown) | undefined;
  private readonly manager: BabylonFocusSink | undefined;

  private derived: AdapterCapabilities = DEFAULT_CAPABILITIES;
  private overrides: Partial<AdapterCapabilities> = {};
  private capabilities: AdapterCapabilities = DEFAULT_CAPABILITIES;
  private sessionState: SessionState = "none";
  private mode: SessionMode | null = null;
  private boundSession: BabylonXRSessionLike | null = null;
  private sessionListeners: {
    readonly type: BabylonXRSessionEventType;
    readonly listener: BabylonXREventListener;
  }[] = [];
  private renderLoopBound = false;
  private frame = 0;
  private lastTimestamp = 0;
  /**
   * Whether the current session is visible/focused; `undefined` while there is
   * no session, meaning ticking is not gated at all. Reset to `undefined` on
   * session end, so a desktop page resumes exactly as before a session ever
   * existed.
   */
  private focused: boolean | undefined;

  /**
   * Pre-bound, because Babylon identifies a render-loop callback by reference:
   * `stopRenderLoop` has to be handed the same function `runRenderLoop` got.
   */
  private readonly loopCallback = (): void => {
    this.tick();
  };

  /** Session lifecycle over Babylon's experience helper. */
  public readonly session: SessionFacet = {
    getState: () => this.sessionState,
    getMode: () => (this.sessionState === "active" ? this.mode : null),
    isSupported: (mode) => this.checkSupportedPublic(mode),
    request: (mode, options) => this.requestSession(mode, options),
    end: () => this.endSession(),
    recentre: () => this.recentreCamera(),
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

  public constructor(options: BabylonRuntimeAdapterOptions = {}) {
    this.xr = options.xr ?? null;
    this.host = options.host;
    this.scheduler = options.scheduler;
    this.referenceSpaceType = options.referenceSpaceType ?? DEFAULT_REFERENCE_SPACE_TYPE;
    this.sessionInit = options.sessionInit;
    this.manager = options.manager;

    const manager = this.xr?.sessionManager;

    this.observe(this.xr?.onStateChangedObservable, (state) => this.handleStateChange(state));
    this.observe(manager?.onXRSessionInit, (session) => this.handleSessionStart(session));
    this.observe(manager?.onXRSessionEnded, () => this.handleSessionEnd());

    const session = this.currentSession();

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

  /** The live `XRSession`, or null outside XR. */
  public getSession(): BabylonXRSessionLike | null {
    return this.boundSession;
  }

  /**
   * Bind the render loop, if this adapter was given a host: each callback runs
   * {@link BabylonRuntimeAdapter.tick}. With no host this does nothing -
   * something else owns the loop, and drives {@link BabylonRuntimeAdapter.tick}
   * or {@link BabylonRuntimeAdapter.emitFrame} itself.
   *
   * Babylon routes `runRenderLoop` through the session's own
   * `requestAnimationFrame` while presenting, so one call covers both the 2D
   * page and the headset.
   */
  public start(): void {
    if (this.renderLoopBound) {
      return;
    }

    this.renderLoopBound = true;
    this.host?.runRenderLoop(this.loopCallback);
  }

  /** Release the render loop. Safe to call when it was never bound. */
  public stop(): void {
    if (!this.renderLoopBound) {
      return;
    }

    this.renderLoopBound = false;
    this.host?.stopRenderLoop(this.loopCallback);
  }

  /** Push one frame to every subscriber. Call this when you own the loop. */
  public emitFrame(timestamp: number, delta: number, frame?: number): void {
    const info: FrameInfo = frame === undefined ? { timestamp, delta } : { timestamp, delta, frame };
    this.frameListeners.forEach((listener) => listener(info));
  }

  /**
   * Re-read the experience's session and publish any capability change. The
   * adapter does this itself on every session and input-source signal; call it
   * directly after the host enables a feature mid-session, or where an
   * experience carries no observables to push with.
   */
  public refreshCapabilities(): void {
    const session = this.currentSession();

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
   * {@link BabylonRuntimeAdapter.clearCapabilityOverrides} or
   * {@link BabylonRuntimeAdapter.dispose}.
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
   * Release everything the adapter holds: the render loop, every observer it
   * added to Babylon, the session's own listeners, any in-flight `end()`, the
   * manual overrides and every subscriber. It does not exit XR and it does not
   * dispose the engine - the app owns both decisions.
   */
  public dispose(): void {
    this.stop();

    for (const detach of this.observerDetachers) {
      detach();
    }

    this.observerDetachers.length = 0;
    this.detachSession();
    this.settleEndWaiters();

    this.overrides = {};
    this.frameListeners.clear();
    this.capabilitiesListeners.clear();
    this.stateListeners.clear();
    this.visibilityListeners.clear();
  }

  /**
   * Subscribe to one Babylon observable and remember how to unsubscribe. An
   * observable a version does not carry is simply skipped.
   */
  private observe<T>(
    observable: BabylonObservableLike<T> | undefined,
    callback: (value: T) => void,
  ): void {
    if (!observable) {
      return;
    }

    const observer = observable.add(callback);

    this.observerDetachers.push(() => {
      observable.remove(observer);
    });
  }

  private currentSession(): BabylonXRSessionLike | null {
    return this.xr?.sessionManager?.session ?? null;
  }

  /**
   * Run one frame step: the visibility gate, the focus/pause signals, the one
   * frame count, {@link BabylonRuntimeAdapter.emitFrame} and `renderTick`.
   * This is what {@link BabylonRuntimeAdapter.start} binds to the owned render
   * loop, and it is public so a host that owns its OWN render loop - one that
   * will never call `start()` because it already calls `runRenderLoop` itself
   * - can drive the exact same step by hand from whatever per-frame hook that
   * host provides, rather than reimplementing the gate, the frame count or the
   * `renderTick` shape.
   *
   * Babylon reports frames with no timestamp of its own, so the clock is read
   * here. `performance.now()` counts from page load rather than from engine
   * start, which is why the first frame reports the fixed
   * {@link FIRST_FRAME_DELTA_MS} rather than a meaninglessly large number.
   */
  public tick(): void {
    const timestamp = performance.now();
    const deltaMs =
      this.lastTimestamp === 0 ? FIRST_FRAME_DELTA_MS : timestamp - this.lastTimestamp;

    this.lastTimestamp = timestamp;

    const session = this.boundSession;

    if (session) {
      this.setFocused(toSessionVisibility(session.visibilityState) === "visible");

      if (!this.focused) {
        // Gated: a live session that is not visible. Skip this tick entirely -
        // no frame, no renderTick, no advance of the frame count - as IWSDK's
        // bridge skips an unfocused frame. A page with no session at all never
        // reaches this branch, so it is never gated.
        return;
      }
    }

    this.frame += 1;

    // `FrameInfo.delta` is seconds; the scheduler's `LifecycleContext` is in
    // milliseconds, which is the unit `BabylonRenderLoopBridge` already emits.
    this.emitFrame(timestamp, deltaMs / 1000, this.frame);

    const context: LifecycleContext = {
      timestamp,
      deltaTime: deltaMs,
      frame: this.frame,
      source: "babylon",
    };

    this.scheduler?.emit("renderTick", context);
  }

  /** Emit focus and pause on a change, as `ServiceBridgeSystem` does. */
  private setFocused(focused: boolean): void {
    if (focused === this.focused) {
      return;
    }

    this.focused = focused;
    this.manager?.emitFocusChange(focused);
    this.manager?.emitPauseChange({ paused: !focused });
  }

  /**
   * Follow `WebXRState`, so a session started outside the adapter - by
   * Babylon's own enter-XR button, for instance - moves the facet exactly as a
   * session this adapter requested does.
   */
  private handleStateChange(state: number): void {
    if (state === BABYLON_WEBXR_STATE.ENTERING_XR) {
      this.setSessionState("requesting");
      return;
    }

    if (state === BABYLON_WEBXR_STATE.IN_XR) {
      this.handleSessionStart(null);
      return;
    }

    if (state === BABYLON_WEBXR_STATE.EXITING_XR) {
      this.setSessionState("ending");
      return;
    }

    if (state === BABYLON_WEBXR_STATE.NOT_IN_XR) {
      this.handleSessionEnd();
    }
  }

  /**
   * Subscribe to one session's own events. The listeners close over the session
   * they belong to, so nothing here has to re-check which session is live.
   */
  private attachSession(session: BabylonXRSessionLike): void {
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

  /**
   * One session starting raises both `onXRSessionInit`, which carries the
   * session, and the `IN_XR` state change, which does not. This therefore runs
   * twice per session and is written to be idempotent: the visibility signal is
   * raised only for a session that was not already bound.
   *
   * @param session the session the signal carried, or null to read the manager.
   */
  private handleSessionStart(session: BabylonXRSessionLike | null): void {
    const next = session ?? this.currentSession();

    if (!next) {
      return;
    }

    const adopted = next !== this.boundSession;

    this.attachSession(next);
    this.setSessionState("active");
    this.updateDerived(next);

    if (adopted) {
      this.notifyVisibility(toSessionVisibility(next.visibilityState));
    }
  }

  /**
   * One session ending raises the session's `end` event, Babylon's
   * `onXRSessionEnded` and the `NOT_IN_XR` state change, so this runs up to
   * three times per session and is written to be idempotent.
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

    // The session that was gating ticks is gone. A page with no session is
    // never gated, so if it had been paused, restore focus now rather than
    // leaving the manager believing it still is.
    if (this.focused === false) {
      this.manager?.emitFocusChange(true);
      this.manager?.emitPauseChange({ paused: false });
    }

    this.focused = undefined;
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
      if (this.mode === mode) {
        return { ok: true };
      }

      // End-and-request: `exitXRAsync` is always there while a session is
      // live, so the switch is always possible.
      await this.endSession();
    }

    const xr = this.xr;

    if (!xr) {
      return { ok: false, reason: "unsupported" };
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
    this.setSessionState("requesting");

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<SessionResult>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), timeoutMs);
    });

    const result = await Promise.race([this.openSession(xr, mode, options), timeout]);
    clearTimeout(timer);

    if (!result.ok) {
      this.setSessionState("none");
      return result;
    }

    this.mode = mode;
    this.setSessionState("active");
    return result;
  }

  /**
   * Enter XR through the experience helper. Nothing here throws at the caller:
   * a headset that is absent, refused or broken is a normal runtime condition,
   * so every outcome comes back as a {@link SessionResult}.
   *
   * The request's own features are merged over the `sessionInit` hook's result
   * by the core's `mergeSessionInit`, so they add to the app's defaults rather
   * than replacing them. A request that names none passes the hook's result
   * through untouched.
   */
  private async openSession(
    xr: BabylonXRExperienceLike,
    mode: SessionMode,
    options?: SessionRequestOptions,
  ): Promise<SessionResult> {
    try {
      const supported = await this.isSupported(xr, mode);

      if (!supported) {
        return { ok: false, reason: "unsupported" };
      }

      const init = mergeSessionInit(this.sessionInit?.(mode), options);
      await xr.enterXRAsync(mode, this.referenceSpaceType, undefined, init);

      // An experience whose observables fired has already adopted the session;
      // one that carries none is adopted here, so both host styles behave alike.
      const session = this.currentSession();

      if (session) {
        this.attachSession(session);
        this.updateDerived(session);
      }

      return { ok: true };
    } catch (error) {
      return { ok: false, reason: toFailureReason(error), error };
    }
  }

  /**
   * Ask Babylon whether the mode is available. A session manager that does not
   * carry the check cannot answer, and reporting `"unsupported"` for a question
   * nobody could ask would refuse a session the device may well grant, so the
   * request goes ahead and `enterXRAsync` reports the real outcome.
   */
  private async isSupported(xr: BabylonXRExperienceLike, mode: SessionMode): Promise<boolean> {
    const manager = xr.sessionManager;

    if (!manager?.isSessionSupportedAsync) {
      return true;
    }

    return manager.isSessionSupportedAsync(mode);
  }

  /**
   * The session facet's public `isSupported`: the same check, but answering
   * `false` rather than throwing when there is no experience or the check
   * itself rejects, because this one must never reject.
   */
  private async checkSupportedPublic(mode: SessionMode): Promise<boolean> {
    const xr = this.xr;

    if (!xr) {
      return false;
    }

    try {
      return await this.isSupported(xr, mode);
    } catch {
      return false;
    }
  }

  /**
   * Move the XR camera (the rig) so the device's current floor position and
   * yaw become the origin, leaving the device's pose local to the camera
   * untouched. Does nothing when the experience carries no camera to move.
   */
  private recentreCamera(): void {
    const camera = this.xr?.camera;

    if (!camera) {
      return;
    }

    const next = recentreRig(
      {
        position: [camera.position.x, camera.position.y, camera.position.z],
        orientation: [
          camera.rotationQuaternion.x,
          camera.rotationQuaternion.y,
          camera.rotationQuaternion.z,
          camera.rotationQuaternion.w,
        ],
      },
      {
        position: [camera.devicePosition.x, camera.devicePosition.y, camera.devicePosition.z],
        orientation: [
          camera.deviceRotationQuaternion.x,
          camera.deviceRotationQuaternion.y,
          camera.deviceRotationQuaternion.z,
          camera.deviceRotationQuaternion.w,
        ],
      },
    );

    camera.position.x = next.position[0];
    camera.position.y = next.position[1];
    camera.position.z = next.position[2];
    camera.rotationQuaternion.x = next.orientation[0];
    camera.rotationQuaternion.y = next.orientation[1];
    camera.rotationQuaternion.z = next.orientation[2];
    camera.rotationQuaternion.w = next.orientation[3];
  }

  private async endSession(): Promise<void> {
    const xr = this.xr;

    if (!xr || this.sessionState === "none") {
      return;
    }

    this.setSessionState("ending");

    const ended = new Promise<void>((resolve) => {
      this.endWaiters.add(resolve);
    });

    try {
      await xr.exitXRAsync();
    } catch {
      // Exiting is best effort. The end signals, not this promise, are what the
      // adapter acts on, and a host that refuses still has to be reported.
    }

    // The signals have normally arrived by now and this is a no-op. An
    // experience that raises none would otherwise leave the caller waiting
    // forever, so the settled `exitXRAsync` call is the fallback.
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

    if (state === "none") {
      this.mode = null;
    }

    this.stateListeners.forEach((listener) => listener(state));
  }
}
