/**
 * Merging per-request session features into a host's `XRSessionInit`.
 *
 * Two host bindings hand an init object straight to WebXR - the three.js
 * adapter through `navigator.xr.requestSession`, the Babylon adapter through
 * `enterXRAsync` - and both have to fold {@link SessionRequestOptions} into
 * whatever their own `sessionInit` hook returned. The rule is identical, so it
 * lives here once rather than being written twice and then drifting.
 *
 * The IWSDK binding does not use this: IWSDK takes structured feature flags
 * rather than string arrays, so it maps the same options onto its own shape.
 */
import type { SessionRequestOptions } from "./runtime-adapter.js";

/** The two members of an `XRSessionInit` this merge touches. */
export interface SessionInitLike {
  readonly requiredFeatures?: readonly string[];
  readonly optionalFeatures?: readonly string[];
}

function toFeatureList(value: unknown): readonly string[] {
  return Array.isArray(value) ? (value as readonly string[]) : [];
}

/** Host entries first, then the caller's, with duplicates dropped. */
function appendUnique(host: readonly string[], extra: readonly string[]): string[] {
  return Array.from(new Set([...host, ...extra]));
}

/**
 * Fold a request's features into the host's `XRSessionInit`.
 *
 * The caller's entries are appended to the host's rather than replacing them,
 * so a per-request feature adds to the app's defaults instead of discarding
 * them, and a feature named in both appears once. A request that names no
 * features returns the host's init object unchanged, identity included, so a
 * host that expects `undefined` still gets `undefined`.
 *
 * `init` is `unknown` because each binding types its own hook's return: an
 * init that is not an object is treated as absent and replaced by the merged
 * features, since a host that returned something unusable had nothing to keep.
 */
export function mergeSessionInit(init: unknown, options?: SessionRequestOptions): unknown {
  const required = options?.requiredFeatures ?? [];
  const optional = options?.optionalFeatures ?? [];

  if (required.length === 0 && optional.length === 0) {
    return init;
  }

  const merged: Record<string, unknown> =
    typeof init === "object" && init !== null ? { ...(init as Record<string, unknown>) } : {};

  if (required.length > 0) {
    merged["requiredFeatures"] = appendUnique(toFeatureList(merged["requiredFeatures"]), required);
  }

  if (optional.length > 0) {
    merged["optionalFeatures"] = appendUnique(toFeatureList(merged["optionalFeatures"]), optional);
  }

  return merged;
}
