/**
 * Structural contracts for the slice of `@iwsdk/core` this shim touches.
 *
 * Mirrors the approach the three.js and Babylon.js bridges take with their
 * engine packages: the shim never imports `@iwsdk/core` directly, so it builds
 * and unit-tests with no IWSDK / WebXR / headset present, and any 0.4.x IWSDK
 * works without bumping this package. Consumers pass the real `World`,
 * `createSystem` and `VisibilityState.Visible` value through
 * {@link makeServiceBridgeSystem}.
 *
 * Every member added here is optional, so a world that only carries the
 * visibility signal - the shape the 1.0.x bridge accepted - still type-checks.
 */

import type {
  CapabilityInputSourceLike,
  CapabilitySessionLike,
} from "@realitycollective/service-framework";

/**
 * IWSDK exposes reactive values as `{ value }` signals. The bridge only reads
 * `.value`; the adapter also subscribes when the signal supports it, which is
 * how it learns that a session came or went without polling every frame.
 */
export interface IWSDKSignalLike<TValue> {
  readonly value: TValue;
  /** Optional push notification. Returns an unsubscribe handle. */
  subscribe?(listener: (value: TValue) => void): () => void;
}

/** One entry of `XRSession.inputSources`; `hand` is set for a tracked hand. */
export type IWSDKInputSourceLike = CapabilityInputSourceLike;

/** The event an `XRSession` raises that the adapter listens for. */
export type IWSDKSessionEventType = "inputsourceschange";

/** Session event callback. The adapter reads the session, not the event. */
export type IWSDKSessionEventListener = (event?: unknown) => void;

/**
 * The slice of the live `XRSession` the adapter reads to derive capabilities.
 * It is the core's {@link CapabilitySessionLike} with `inputSources` required,
 * because an IWSDK world always carries the collection, and the adapter hands
 * the session straight to the core's `deriveCapabilities`.
 *
 * The two listener members are what IWSDK's own session carries, because it is
 * a real `XRSession`. They are optional all the same, so a world faked in a
 * test still satisfies the type without them, and the adapter guards for their
 * absence rather than assuming a full session.
 */
export interface IWSDKSessionLike extends CapabilitySessionLike {
  readonly inputSources: Iterable<IWSDKInputSourceLike>;
  addEventListener?(type: IWSDKSessionEventType, listener: IWSDKSessionEventListener): void;
  removeEventListener?(type: IWSDKSessionEventType, listener: IWSDKSessionEventListener): void;
}

/**
 * The slice of an IWSDK `World` the bridge and adapter read: the visibility
 * signal, the live session, and the session entry points.
 */
/**
 * IWSDK's `FeatureFlag`. `true` requests the feature as optional,
 * `{ required: true }` as required, and `false` or absent does not request it.
 */
export type IWSDKFeatureFlagLike = boolean | { readonly required?: boolean };

/**
 * IWSDK's `DepthSensingFlag` - a {@link IWSDKFeatureFlagLike} that can also
 * carry the depth usage and format preferences.
 */
export type IWSDKDepthSensingFlagLike =
  | boolean
  | {
      readonly required?: boolean;
      readonly usage?: "cpu-optimized" | "gpu-optimized";
      readonly format?: "luminance-alpha" | "float32";
    };

/**
 * IWSDK's `XRFeatureOptions`. IWSDK takes structured flags rather than the
 * WebXR feature strings, which is why the adapter maps between the two.
 */
export interface IWSDKXRFeatureOptionsLike {
  readonly handTracking?: IWSDKFeatureFlagLike;
  readonly anchors?: IWSDKFeatureFlagLike;
  readonly hitTest?: IWSDKFeatureFlagLike;
  readonly planeDetection?: IWSDKFeatureFlagLike;
  readonly meshDetection?: IWSDKFeatureFlagLike;
  readonly depthSensing?: IWSDKDepthSensingFlagLike;
  readonly layers?: IWSDKFeatureFlagLike;
  readonly unbounded?: IWSDKFeatureFlagLike;
}

/**
 * The slice of IWSDK `XROptions` the session facet passes to `launchXR`.
 * `sessionMode` carries the WebXR mode string ("immersive-vr", "immersive-ar",
 * "inline"), which is also the value of IWSDK's `SessionMode` enum members.
 * `launchXR` merges what it is given over the world's `xrDefaults`, so anything
 * left out here keeps the app's default.
 */
export interface IWSDKXROptionsLike {
  readonly sessionMode?: string;
  readonly features?: IWSDKXRFeatureOptionsLike;
}

export interface IWSDKWorldLike<TVisibility = unknown> {
  readonly visibilityState: IWSDKSignalLike<TVisibility>;
  /** The live XR session, or null/absent when the app is running in 2D. */
  readonly session?: IWSDKSessionLike | null;
  /** IWSDK's session entry point. Absent on a host that cannot start one. */
  launchXR?(options?: IWSDKXROptionsLike): void;
  /** IWSDK's session exit point. Absent on a host that cannot end one. */
  exitXR?(): void;
}

/** The per-frame entry point IWSDK invokes on a registered system. */
export interface IWSDKSystemLike {
  update(delta: number, time: number): void;
}

/** Constructor shape of the base class IWSDK's `createSystem` returns. */
export type IWSDKSystemConstructor = new (...args: unknown[]) => IWSDKSystemLike;

/**
 * Structural shape of IWSDK's `createSystem` factory. `createSystem(schema)`
 * returns a base system class that the bridge extends; the bridge passes an
 * empty schema because it queries no ECS components.
 */
export type CreateSystemLike = (schema?: Record<string, unknown>) => IWSDKSystemConstructor;
