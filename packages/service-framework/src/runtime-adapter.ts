/**
 * Runtime adapter contract - the seam between a host runtime and services.
 *
 * A host runtime is whatever owns the frame loop and the XR session: IWSDK, a
 * three.js render loop, a plain browser page, or a test harness. The adapter is
 * the one object a service depends on to reach it, and it carries three things:
 *
 *   - a per-frame fan-out (`onFrame`),
 *   - capability flags the service gates on (`getCapabilities`,
 *     `onCapabilitiesChange`), and
 *   - an optional session facet for XR session lifecycle (`session`).
 *
 * `MockRuntimeAdapter` implements the same interface, so a service written
 * against `RuntimeAdapter` is unit-testable headless with no engine, no WebXR
 * and no headset.
 *
 * Decision reversed on 2026-09-03. This file previously said the adapter
 * "deliberately does NOT re-abstract" sessions, input and rendering, on the
 * grounds that IWSDK already owns them. That held while every consumer was an
 * IWSDK app. It stopped holding when a reference client had to request a
 * session, end a session and read session visibility: with no seam for it, the
 * client reached past the adapter into the host, which is exactly the coupling
 * the adapter exists to prevent. Session lifecycle is now an optional facet -
 * `RuntimeAdapter.session` - so a host that owns sessions can expose them and a
 * host that does not can leave the property off. Input and rendering are still
 * not abstracted here.
 */

export type Unsubscribe = () => void;

export interface FrameInfo {
  /** Frame timestamp in milliseconds (IWSDK system `time`). */
  readonly timestamp: number;
  /** Seconds elapsed since the previous frame (IWSDK system `delta`). */
  readonly delta: number;
}

/**
 * The three blend modes WebXR defines for `XRSession.environmentBlendMode`.
 *
 * - `"opaque"` - the rendered image is all the player sees.
 * - `"alpha-blend"` - video passthrough, as on a Quest. The rendered image is
 *   composited over the camera feed normally, so black stays black.
 * - `"additive"` - a see-through optical display. The rendered image is added
 *   to the light already reaching the eye, so black is fully transparent.
 */
export type EnvironmentBlendMode = "opaque" | "alpha-blend" | "additive";

/** XR capabilities services gate on (e.g. passthrough requires `immersive`). */
export interface AdapterCapabilities {
  readonly immersive: boolean;
  readonly handTracking: boolean;
  readonly planeDetection: boolean;
  /** True for any blend mode other than `"opaque"`: the world shows through. */
  readonly passthrough: boolean;
  /**
   * Which blend mode, where {@link AdapterCapabilities.passthrough} only says
   * whether there is one. The two passthrough modes behave oppositely, so a
   * service that draws for one draws wrongly for the other: dimming the world
   * on an `"additive"` display means drawing brighter, not darker. `null` where
   * there is no session, or where the host reports a value WebXR does not
   * define.
   */
  readonly environmentBlendMode: EnvironmentBlendMode | null;
}

export const DEFAULT_CAPABILITIES: AdapterCapabilities = {
  immersive: false,
  handTracking: false,
  planeDetection: false,
  passthrough: false,
  environmentBlendMode: null,
};

export type FrameListener = (frame: FrameInfo) => void;
export type CapabilitiesListener = (capabilities: AdapterCapabilities) => void;

/** The session kinds a host can be asked for; the WebXR session mode strings. */
export type SessionMode = "immersive-vr" | "immersive-ar" | "inline";

/** Where the host is in the session lifecycle. */
export type SessionState = "none" | "requesting" | "active" | "ending";

/** Why a session request did not produce a session. */
export type SessionFailureReason = "unsupported" | "denied" | "timeout" | "error";

/**
 * The outcome of {@link SessionFacet.request}. A request never rejects: a host
 * that cannot start a session is a normal runtime condition, not a bug, so the
 * caller gets a result to branch on rather than an exception to catch.
 */
export type SessionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: SessionFailureReason; readonly error?: unknown };

/**
 * Session visibility as the host reports it. `non-immersive` means the page is
 * running in 2D with no session at all, which WebXR itself has no value for.
 */
export type SessionVisibility = "visible" | "visible-blurred" | "hidden" | "non-immersive";

export interface SessionRequestOptions {
  /** How long to wait for the session before giving up. Default 10000 ms. */
  readonly timeoutMs?: number;
  /**
   * WebXR feature strings the session cannot do without, such as
   * `"hand-tracking"`. A host that cannot grant one refuses the whole request.
   *
   * These are merged over whatever the host binding was configured with rather
   * than replacing it, so a per-request feature is an addition and never a way
   * to lose the app's own defaults. An app that swaps from `"immersive-vr"` to
   * `"immersive-ar"` mid-session needs this: without it the second session gets
   * whatever defaults the host was built with, which were chosen for the first.
   */
  readonly requiredFeatures?: readonly string[];
  /** WebXR feature strings to request but do without. Merged the same way. */
  readonly optionalFeatures?: readonly string[];
}

/** How long {@link SessionFacet.request} waits before reporting a timeout. */
export const DEFAULT_SESSION_TIMEOUT_MS = 10_000;

/**
 * Optional session lifecycle facet. Present on adapters whose host owns an XR
 * session; absent on hosts that do not (a plain render loop, for instance).
 * Check `adapter.session` before using it.
 */
export interface SessionFacet {
  /** The current lifecycle state; `"none"` before anything is requested. */
  getState(): SessionState;
  /** Ask the host for a session. Resolves with the outcome, never rejects. */
  request(mode: SessionMode, options?: SessionRequestOptions): Promise<SessionResult>;
  /** Ask the host to end the session. Resolves once the session is gone. */
  end(): Promise<void>;
  /** Subscribe to lifecycle transitions; returns an unsubscribe handle. */
  onStateChange(listener: (state: SessionState) => void): Unsubscribe;
  /** Subscribe to visibility changes; returns an unsubscribe handle. */
  onVisibilityChange(listener: (visibility: SessionVisibility) => void): Unsubscribe;
}

export interface RuntimeAdapter {
  /** Subscribe to per-frame updates; returns an unsubscribe handle. */
  onFrame(listener: FrameListener): Unsubscribe;
  /** Current XR capabilities (may change once a session is established). */
  getCapabilities(): AdapterCapabilities;
  /**
   * Subscribe to capability changes; returns an unsubscribe handle. Mirrors
   * {@link RuntimeAdapter.onFrame} so gating services can react to a session
   * coming online instead of polling {@link RuntimeAdapter.getCapabilities}
   * every frame.
   */
  onCapabilitiesChange(listener: CapabilitiesListener): Unsubscribe;
  /** Session lifecycle, if this host owns sessions. See {@link SessionFacet}. */
  readonly session?: SessionFacet;
}

/**
 * Every optional facet a {@link RuntimeAdapter} can carry. A conformance test
 * walks this list, so an adapter that grows a facet without implementing it in
 * the mock fails the suite rather than being found by a consumer.
 */
export const RUNTIME_ADAPTER_FACETS = ["session"] as const;

export type RuntimeAdapterFacet = (typeof RUNTIME_ADAPTER_FACETS)[number];
