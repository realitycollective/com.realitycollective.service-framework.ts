/**
 * Capability derivation, shared by every host binding.
 *
 * Each adapter reads the same four flags off whatever session object its host
 * hands it: IWSDK's `world.session`, three.js's `renderer.xr.getSession()`, or
 * a test double. The rules are identical, so they live here once rather than
 * being re-implemented - and re-drifted - per package.
 *
 * The input is structural on purpose. Nothing here imports WebXR types, so the
 * core still builds and unit-tests with no DOM, no WebXR and no headset.
 */
import { DEFAULT_CAPABILITIES, type AdapterCapabilities } from "./runtime-adapter.js";

/** One entry of `XRSession.inputSources`; `hand` is set for a tracked hand. */
export interface CapabilityInputSourceLike {
  readonly hand?: unknown;
}

/**
 * The slice of a live XR session capability derivation reads. Every member is
 * optional, so a host that reports less than a full `XRSession` still fits.
 */
export interface CapabilitySessionLike {
  readonly enabledFeatures?: readonly string[];
  readonly environmentBlendMode?: string;
  readonly inputSources?: Iterable<CapabilityInputSourceLike>;
}

function hasHandInput(inputSources: Iterable<CapabilityInputSourceLike> | undefined): boolean {
  if (!inputSources) {
    return false;
  }

  for (const inputSource of inputSources) {
    if (inputSource.hand) {
      return true;
    }
  }

  return false;
}

/**
 * Derive the capability flags from a live session.
 *
 * | Flag | Derived from |
 * | --- | --- |
 * | `immersive` | a session exists |
 * | `handTracking` | `"hand-tracking"` in `enabledFeatures`, or any input source carrying a `hand` |
 * | `planeDetection` | `"plane-detection"` in `enabledFeatures` |
 * | `passthrough` | `environmentBlendMode` is present and is not `"opaque"` |
 *
 * With no session the result is {@link DEFAULT_CAPABILITIES}, all false, so a
 * gating service behaves conservatively before the player enters XR.
 */
export function deriveCapabilities(
  session: CapabilitySessionLike | null | undefined,
): AdapterCapabilities {
  if (!session) {
    return DEFAULT_CAPABILITIES;
  }

  const features = session.enabledFeatures ?? [];
  const blendMode = session.environmentBlendMode;

  return {
    immersive: true,
    handTracking: features.includes("hand-tracking") || hasHandInput(session.inputSources),
    planeDetection: features.includes("plane-detection"),
    passthrough: blendMode !== undefined && blendMode !== "opaque",
  };
}
