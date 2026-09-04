/**
 * IWSDK implementation of {@link RuntimeAdapter}. IWSDK owns the render loop, so
 * frames are pushed in rather than pulled: the `ServiceBridgeSystem` (a normal
 * IWSDK system) calls {@link IWSDKAdapter.emitFrame} once per frame and the
 * adapter notifies subscribed services.
 *
 * Capabilities are derived from the live session on construction and on every
 * visibility change, through the core's shared `deriveCapabilities`, with a
 * manual override layer on top. Session lifecycle is
 * exposed through {@link IWSDKAdapter.session}, over the world's `launchXR` and
 * `exitXR` entry points.
 */
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_SESSION_TIMEOUT_MS,
  deriveCapabilities,
  type AdapterCapabilities,
  type CapabilitiesListener,
  type FrameInfo,
  type FrameListener,
  type RuntimeAdapter,
  type SessionFacet,
  type SessionMode,
  type SessionRequestOptions,
  type SessionResult,
  type SessionState,
  type SessionVisibility,
  type Unsubscribe,
} from "@realitycollective/service-framework";
import type { IWSDKWorldLike } from "./iwsdk-host.js";

type SessionStateListener = (state: SessionState) => void;
type SessionVisibilityListener = (visibility: SessionVisibility) => void;

/** How often the session waits re-check the world when the signal is silent. */
const SESSION_POLL_INTERVAL_MS = 50;

const SESSION_VISIBILITY_VALUES: ReadonlySet<string> = new Set([
  "visible",
  "visible-blurred",
  "hidden",
  "non-immersive",
]);

/**
 * IWSDK's visibility signal carries the WebXR visibility strings. Anything this
 * adapter does not recognise is reported as `"hidden"`, because treating an
 * unknown state as visible would keep game logic running when it should not.
 */
function toSessionVisibility(value: unknown): SessionVisibility {
  if (typeof value === "string" && SESSION_VISIBILITY_VALUES.has(value)) {
    return value as SessionVisibility;
  }

  return "hidden";
}

/** A `request()` or `end()` waiting for the world to reach some state. */
interface PendingWait {
  readonly predicate: () => boolean;
  readonly resolve: (settled: boolean) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly interval: ReturnType<typeof setInterval>;
}

export class IWSDKAdapter implements RuntimeAdapter {
  private readonly frameListeners = new Set<FrameListener>();
  private readonly capabilitiesListeners = new Set<CapabilitiesListener>();
  private readonly stateListeners = new Set<SessionStateListener>();
  private readonly visibilityListeners = new Set<SessionVisibilityListener>();
  private readonly pendingWaits = new Set<PendingWait>();

  private derived: AdapterCapabilities = DEFAULT_CAPABILITIES;
  private overrides: Partial<AdapterCapabilities> = {};
  private capabilities: AdapterCapabilities = DEFAULT_CAPABILITIES;
  private sessionState: SessionState = "none";
  private unsubscribeVisibility: Unsubscribe | undefined;

  /** Session lifecycle over the world's `launchXR` / `exitXR` entry points. */
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

  public constructor(private readonly world: IWSDKWorldLike) {
    this.unsubscribeVisibility = world.visibilityState.subscribe?.((value) => {
      this.handleVisibilityChange(value);
    });

    this.derived = deriveCapabilities(this.world.session);
    this.capabilities = this.derived;
    this.sessionState = this.hasSession() ? "active" : "none";
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

  /** The IWSDK `World` this adapter is bound to. */
  public getWorld(): IWSDKWorldLike {
    return this.world;
  }

  /**
   * Re-read the live session and publish any capability change. The adapter
   * does this itself whenever the visibility signal fires; call it directly on
   * a host whose signal has no `subscribe`, or after the host enables a feature
   * mid-session.
   */
  public refreshCapabilities(): void {
    this.derived = deriveCapabilities(this.world.session);
    this.publishCapabilities();
  }

  /**
   * Force capability flags regardless of what the session reports. Overrides
   * are a layer on top of the derived values: they win for as long as they are
   * set, survive every later derivation, and are dropped only by
   * {@link IWSDKAdapter.clearCapabilityOverrides} or
   * {@link IWSDKAdapter.dispose}. Subscribers are notified if the effective
   * capabilities changed.
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

  /** Called once per frame by the ECS bridge system. */
  public emitFrame(timestamp: number, delta: number): void {
    const frame: FrameInfo = { timestamp, delta };
    this.frameListeners.forEach((listener) => listener(frame));
  }

  /**
   * Release everything the adapter holds: the visibility subscription, any
   * in-flight session wait, the manual overrides and every listener.
   */
  public dispose(): void {
    this.unsubscribeVisibility?.();
    this.unsubscribeVisibility = undefined;

    for (const wait of Array.from(this.pendingWaits)) {
      this.settleWait(wait, false);
    }

    this.overrides = {};
    this.frameListeners.clear();
    this.capabilitiesListeners.clear();
    this.stateListeners.clear();
    this.visibilityListeners.clear();
  }

  private hasSession(): boolean {
    return Boolean(this.world.session);
  }

  private publishCapabilities(): void {
    const next: AdapterCapabilities = { ...this.derived, ...this.overrides };
    const current = this.capabilities;

    if (
      next.immersive === current.immersive &&
      next.handTracking === current.handTracking &&
      next.planeDetection === current.planeDetection &&
      next.passthrough === current.passthrough
    ) {
      return;
    }

    this.capabilities = next;
    this.capabilitiesListeners.forEach((listener) => listener(next));
  }

  private handleVisibilityChange(value: unknown): void {
    this.refreshCapabilities();
    this.syncSessionState();
    this.checkWaits();

    const visibility = toSessionVisibility(value);
    this.visibilityListeners.forEach((listener) => listener(visibility));
  }

  /**
   * Follow the world when nothing local is mid-transition. `request()` and
   * `end()` own the state while they run, so the signal does not fight them.
   */
  private syncSessionState(): void {
    if (this.sessionState === "requesting" || this.sessionState === "ending") {
      return;
    }

    this.setSessionState(this.hasSession() ? "active" : "none");
  }

  private async requestSession(
    mode: SessionMode,
    options?: SessionRequestOptions,
  ): Promise<SessionResult> {
    if (this.sessionState === "active") {
      return { ok: true };
    }

    const launch = this.world.launchXR;

    if (!launch) {
      return { ok: false, reason: "unsupported" };
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
    this.setSessionState("requesting");

    try {
      // IWSDK reads `XROptions.sessionMode`; its `SessionMode` enum values are the
      // WebXR mode strings, so the facet mode passes through unchanged.
      launch.call(this.world, { sessionMode: mode });
    } catch (error) {
      this.setSessionState("none");
      return { ok: false, reason: "unsupported", error };
    }

    const started = await this.waitFor(() => this.hasSession(), timeoutMs);

    if (!started) {
      this.setSessionState("none");
      return { ok: false, reason: "timeout" };
    }

    this.setSessionState("active");
    this.refreshCapabilities();
    return { ok: true };
  }

  private async endSession(): Promise<void> {
    if (this.sessionState === "none") {
      return;
    }

    const exit = this.world.exitXR;
    this.setSessionState("ending");

    if (exit) {
      exit.call(this.world);
    }

    await this.waitFor(() => !this.hasSession(), DEFAULT_SESSION_TIMEOUT_MS);
    this.setSessionState("none");
    this.refreshCapabilities();
  }

  /**
   * Resolve `true` once `predicate` holds, `false` on timeout. The visibility
   * signal drives this where the host has one; the interval is the fallback for
   * a host whose signal does not push, and for a session that appears without
   * a visibility transition.
   */
  private waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
    if (predicate()) {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      const wait: PendingWait = {
        predicate,
        resolve,
        timer: setTimeout(() => this.settleWait(wait, false), timeoutMs),
        interval: setInterval(() => this.checkWaits(), SESSION_POLL_INTERVAL_MS),
      };

      this.pendingWaits.add(wait);
    });
  }

  private checkWaits(): void {
    for (const wait of Array.from(this.pendingWaits)) {
      if (wait.predicate()) {
        this.settleWait(wait, true);
      }
    }
  }

  private settleWait(wait: PendingWait, settled: boolean): void {
    this.pendingWaits.delete(wait);
    clearTimeout(wait.timer);
    clearInterval(wait.interval);
    wait.resolve(settled);
  }

  private setSessionState(state: SessionState): void {
    if (this.sessionState === state) {
      return;
    }

    this.sessionState = state;
    this.stateListeners.forEach((listener) => listener(state));
  }
}
