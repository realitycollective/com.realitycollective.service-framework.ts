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
  /** Frame timestamp in milliseconds, on every platform. */
  readonly timestamp: number;
  /** Seconds elapsed since the previous frame. */
  readonly delta: number;
  /**
   * The binding's frame count, from 1: the SAME number the `renderTick`
   * context carries for this frame. Set by every binding that runs its own
   * loop (the native host's frames, the IWSDK bridge, the three.js and
   * Babylon.js owned loops), so a client that needs a frame number reads
   * this one clock rather than counting frames again. Absent when an app
   * calls `emitFrame` itself without one.
   */
  readonly frame?: number;
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

/**
 * The WebXR reference space every binding requests for a session: the origin
 * is where the session began, +Y is up with the floor at y = 0, and -Z is the
 * initial forward direction.
 *
 * What each platform does with it:
 * - IWSDK: `XROptions.referenceSpace` defaults to this value.
 * - three.js: `WebXRManager`'s own default reference space type is this value.
 * - Babylon.js: `DEFAULT_REFERENCE_SPACE_TYPE`, exported by the Babylon
 *   binding, is this value.
 * - Native: OpenXR `STAGE` space when the runtime has one (a stage carries its
 *   own floor), else `LOCAL` with the floor offset the host applies itself.
 */
export const SESSION_REFERENCE_SPACE = "local-floor";

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
  /**
   * The mode of the live session, or `null` when there is none. Reports the
   * mode this facet most recently requested and is still running; a session
   * the app adopted from outside the facet - already active before the
   * adapter was constructed, or started through a host's own UI - reports
   * `null` even while live, because a WebXR `XRSession` carries no mode of its
   * own to read back. Stands in for IWSDK, which keeps the mode it launched
   * with on `XROptions` rather than on the live session either.
   */
  getMode(): SessionMode | null;
  /**
   * Whether the host could start `mode` right now. Answers without changing
   * `getState()` or starting anything, and never rejects - a host that cannot
   * answer the question resolves `false`. Stands in for
   * `navigator.xr.isSessionSupported`.
   */
  isSupported(mode: SessionMode): Promise<boolean>;
  /**
   * Ask the host for a session. Resolves with the outcome, never rejects.
   *
   * Requesting a different mode while a session is already active ENDS the
   * live session first and then requests the new one - "end-and-request" -
   * walking the lifecycle `active`, `ending`, `none`, `requesting` and
   * `active`, exactly as calling {@link SessionFacet.end} and then
   * {@link SessionFacet.request} would. Requesting the SAME mode that is
   * already active is a no-op that resolves `{ ok: true }` without touching
   * the session. On a host that cannot end its own session, the request
   * resolves `{ ok: false, reason: "unsupported" }` and the live session is
   * left running untouched.
   */
  request(mode: SessionMode, options?: SessionRequestOptions): Promise<SessionResult>;
  /** Ask the host to end the session. Resolves once the session is gone. */
  end(): Promise<void>;
  /**
   * Make the viewer's current position on the floor plane, and its current
   * yaw, the new origin: after it returns, the viewer stands at x = 0, z = 0
   * facing -Z. `y` is untouched and the floor stays the floor - only position
   * on the floor plane and yaw move. A no-op with no live session; never
   * throws. Stands in for recentring by moving IWSDK's player rig (see
   * {@link recentreRig}), or for a WebXR app that offsets its own reference
   * space (see {@link recentreOffset}).
   */
  recentre(): void;
  /** Subscribe to lifecycle transitions; returns an unsubscribe handle. */
  onStateChange(listener: (state: SessionState) => void): Unsubscribe;
  /** Subscribe to visibility changes; returns an unsubscribe handle. */
  onVisibilityChange(listener: (visibility: SessionVisibility) => void): Unsubscribe;
}

/**
 * The seam between services and whatever host runs them.
 *
 * Beyond this interface, every adapter must expose
 * `setCapabilities(partial: Partial<AdapterCapabilities>)`: a sticky override
 * layer on top of whatever the adapter derives from its host. An override wins
 * for as long as it is set and survives every later derivation. An adapter that
 * derives capabilities also exposes `clearCapabilityOverrides()` to drop them.
 * Subscribers are notified when the effective capabilities change. The method
 * belongs to the host application and to tests, not to services, which is why
 * it is not a member here. `runtimeAdapterContractCases()` drives
 * capability changes through it, because an adapter that only derives from a
 * live host has no other way to flip a flag on demand.
 */
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

/**
 * A position in metres and an orientation as a unit quaternion, both local to
 * whatever frame the caller names. Tuples, not objects, so a binding can build
 * one from any engine's vector/quaternion without a mapping layer.
 */
export interface RigidPose {
  /** Metres, `[x, y, z]`. */
  readonly position: readonly [number, number, number];
  /** A unit quaternion, `[x, y, z, w]`. */
  readonly orientation: readonly [number, number, number, number];
}

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

/** Rotate a vector by a quaternion (the standard Hamilton product form). */
function rotateVector(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;

  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

/** Hamilton product `a * b`: applies `b`'s rotation first, then `a`'s. */
function multiplyQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;

  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** The inverse of a unit quaternion. */
function conjugateQuat(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** A pure rotation about +Y by `angle` radians. */
function yawQuaternion(angle: number): Quat {
  return [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
}

/**
 * The yaw (heading about +Y), in radians, that turns -Z into this
 * orientation's forward direction projected onto the horizontal plane. Pitch
 * and roll do not affect it.
 */
function yawOf(orientation: Quat): number {
  const forward = rotateVector(orientation, [0, 0, -1]);
  return Math.atan2(-forward[0], -forward[2]);
}

/**
 * The rigid transform that, applied as a WebXR reference-space offset
 * (`XRReferenceSpace.getOffsetReferenceSpace`), puts `viewer` at the origin
 * facing -Z with its `y` unchanged - the offset {@link SessionFacet.recentre}
 * applies on a platform that offsets its own reference space rather than
 * moving a rig. Only position on the floor plane and yaw are involved: the
 * offset's own `y` is always `0`, so it never shifts the viewer vertically,
 * and only the yaw component of the orientation is used, so pitch and roll
 * read the same afterwards.
 */
export function recentreOffset(viewer: RigidPose): RigidPose {
  return {
    position: [viewer.position[0], 0, viewer.position[2]],
    orientation: yawQuaternion(yawOf(viewer.orientation)),
  };
}

/**
 * The new pose for a player rig, given its current pose (`rig`, world space)
 * and the head's pose local to that rig (`headLocal`, unaffected by
 * recentring), such that the head ends up at the origin facing -Z with its
 * world `y` unchanged - the rig move {@link SessionFacet.recentre} applies on
 * a platform, such as IWSDK, that recentres by moving a player rig rather than
 * offsetting a reference space. `headLocal` is read, never written: only the
 * returned rig pose changes.
 */
export function recentreRig(rig: RigidPose, headLocal: RigidPose): RigidPose {
  const headWorldPosition: Vec3 = [
    rig.position[0] + rotateVector(rig.orientation, headLocal.position)[0],
    rig.position[1] + rotateVector(rig.orientation, headLocal.position)[1],
    rig.position[2] + rotateVector(rig.orientation, headLocal.position)[2],
  ];
  const headWorldOrientation = multiplyQuat(rig.orientation, headLocal.orientation);

  // The head's world orientation with its yaw zeroed, pitch and roll kept -
  // exactly what recentreOffset does for a reference-space offset.
  const yawRemoval = conjugateQuat(yawQuaternion(yawOf(headWorldOrientation)));
  const desiredHeadOrientation = multiplyQuat(yawRemoval, headWorldOrientation);

  // Solve the rig orientation that, composed with the unchanged headLocal
  // orientation, produces the desired head orientation.
  const rigOrientation = multiplyQuat(desiredHeadOrientation, conjugateQuat(headLocal.orientation));

  const rotatedHeadLocal = rotateVector(rigOrientation, headLocal.position);
  const rigPosition: Vec3 = [
    0 - rotatedHeadLocal[0],
    headWorldPosition[1] - rotatedHeadLocal[1],
    0 - rotatedHeadLocal[2],
  ];

  return { position: rigPosition, orientation: rigOrientation };
}
