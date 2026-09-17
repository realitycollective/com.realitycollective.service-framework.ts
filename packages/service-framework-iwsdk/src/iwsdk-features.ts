/**
 * Mapping WebXR feature strings onto IWSDK's structured feature flags.
 *
 * `SessionRequestOptions` carries `requiredFeatures` and `optionalFeatures` as
 * WebXR strings, which is what the three.js and Babylon bindings hand straight
 * to `XRSessionInit`. IWSDK does not take strings: `launchXR` takes an
 * `XROptions` whose `features` is a structured object, one key per feature,
 * each set to `true` for optional or `{ required: true }` for required. This
 * translates between the two so an app can name features the same way whatever
 * host it is on.
 *
 * IWSDK names eight features. A WebXR string outside that set - `"local-floor"`
 * and `"bounded-floor"`, which IWSDK configures through `referenceSpace`
 * instead, or `"dom-overlay"`, which it does not model - has nowhere to go. It
 * is collected and reported rather than thrown, because a request that names
 * one is still a request the host can serve: dropping the string leaves the
 * rest of the session intact, while throwing would fail a session over a
 * feature the app may not need.
 */
import type { SessionRequestOptions } from "@realitycollective/service-framework";
import type { IWSDKFeatureFlagLike, IWSDKXRFeatureOptionsLike } from "./iwsdk-host.js";

/**
 * The eight WebXR feature strings IWSDK has a key for. Anything else is
 * unmappable; see {@link IWSDKFeatureMapping.unmapped}.
 */
export const IWSDK_FEATURE_KEYS: Readonly<Record<string, keyof IWSDKXRFeatureOptionsLike>> = {
  "hand-tracking": "handTracking",
  anchors: "anchors",
  "hit-test": "hitTest",
  "plane-detection": "planeDetection",
  "mesh-detection": "meshDetection",
  "depth-sensing": "depthSensing",
  layers: "layers",
  unbounded: "unbounded",
};

/** What {@link toIWSDKFeatures} made of a request's feature strings. */
export interface IWSDKFeatureMapping {
  /**
   * The structured flags to pass as `XROptions.features`, absent when nothing
   * mapped. `launchXR` merges what it is given over the world's `xrDefaults`,
   * so sending nothing leaves the app's defaults alone.
   */
  readonly features?: IWSDKXRFeatureOptionsLike;
  /**
   * Feature strings IWSDK has no key for, in the order they were first seen.
   * They are dropped from the request. Read this to log or refuse ahead of a
   * call, since the adapter itself says nothing about them.
   */
  readonly unmapped: readonly string[];
}

function collect(
  names: readonly string[] | undefined,
  flag: IWSDKFeatureFlagLike,
  flags: Record<string, IWSDKFeatureFlagLike>,
  unmapped: Set<string>,
): void {
  for (const name of names ?? []) {
    const key = IWSDK_FEATURE_KEYS[name];

    if (key === undefined) {
      unmapped.add(name);
      continue;
    }

    flags[key] = flag;
  }
}

/**
 * Translate a request's feature strings into IWSDK's `XRFeatureOptions`.
 *
 * A feature named in both lists comes out required, because the stricter of
 * the two is the one the caller cannot do without.
 */
export function toIWSDKFeatures(options?: SessionRequestOptions): IWSDKFeatureMapping {
  const flags: Record<string, IWSDKFeatureFlagLike> = {};
  const unmapped = new Set<string>();

  // Optional first, so a name in both lists is overwritten by the required flag.
  collect(options?.optionalFeatures, true, flags, unmapped);
  collect(options?.requiredFeatures, { required: true }, flags, unmapped);

  const mapped = Object.keys(flags).length > 0;

  return {
    ...(mapped ? { features: flags as IWSDKXRFeatureOptionsLike } : {}),
    unmapped: Array.from(unmapped),
  };
}
