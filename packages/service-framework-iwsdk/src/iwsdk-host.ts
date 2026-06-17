/**
 * Structural contracts for the slice of `@iwsdk/core` this shim touches.
 *
 * Mirrors the approach the three.js and Babylon.js bridges take with their
 * engine packages: the shim never imports `@iwsdk/core` directly, so it builds
 * and unit-tests with no IWSDK / WebXR / headset present, and any 0.4.x IWSDK
 * works without bumping this package. Consumers pass the real `World`,
 * `createSystem` and `VisibilityState.Visible` value through
 * {@link makeServiceBridgeSystem}.
 */

/** IWSDK exposes reactive values as `{ value }` signals; the bridge only reads `.value`. */
export interface IWSDKSignalLike<TValue> {
  readonly value: TValue;
}

/** The slice of an IWSDK `World` the bridge reads: the visibility signal. */
export interface IWSDKWorldLike<TVisibility = unknown> {
  readonly visibilityState: IWSDKSignalLike<TVisibility>;
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
