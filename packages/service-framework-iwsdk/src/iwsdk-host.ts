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

/**
 * The slice of the live `XRSession` the adapter reads to derive capabilities.
 * It is the core's {@link CapabilitySessionLike} with `inputSources` required,
 * because an IWSDK world always carries the collection, and the adapter hands
 * the session straight to the core's `deriveCapabilities`.
 */
export interface IWSDKSessionLike extends CapabilitySessionLike {
  readonly inputSources: Iterable<IWSDKInputSourceLike>;
}

/**
 * The slice of an IWSDK `World` the bridge and adapter read: the visibility
 * signal, the live session, and the session entry points.
 */
/**
 * The slice of IWSDK `XROptions` the session facet passes to `launchXR`.
 * `sessionMode` carries the WebXR mode string ("immersive-vr", "immersive-ar",
 * "inline"), which is also the value of IWSDK's `SessionMode` enum members.
 */
export interface IWSDKXROptionsLike {
  readonly sessionMode?: string;
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
