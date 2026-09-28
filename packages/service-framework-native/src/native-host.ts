/**
 * The host object a native app installs before it evaluates the bundle.
 *
 * A native XR app (OpenXR on Quest, CompositorServices on visionOS, or any
 * other shell) embeds a JavaScript engine such as Hermes and owns the session,
 * the frame loop, rendering and physics. It hands JavaScript one object,
 * `globalThis.__rcHost`, and everything crosses it as plain values: numbers,
 * strings, arrays, plain objects and `Uint8Array`. The only functions that
 * cross are listener callbacks, and each `on*` method returns an unsubscribe
 * function.
 *
 * This package reads the root members and `io`. Each other Reality Collective
 * family reads its own optional slice through its own native package:
 * `input` and `interactions` in `@realitycollective/native-interactions`,
 * `ui` in `@realitycollective/native-uiextensions`, and `environment`,
 * `audio` and `sensing` in `@realitycollective/native-environment`.
 */
import type { EnvironmentBlendMode, SessionMode } from "@realitycollective/service-framework";

/** The name of the global the native app installs. */
export const NATIVE_HOST_GLOBAL = "__rcHost";

/** The session as the native app reports it. */
export interface NativeSessionInfo {
  /**
   * The OpenXR `XrSessionState` name, or `"none"` before a session exists.
   * `ready` onward until `stopping` is a live session: the adapter reports
   * `immersive` and the session state `active` together from `ready`, as a
   * WebXR session is live from the moment it exists.
   */
  readonly state: "none" | "idle" | "ready" | "synchronized" | "visible" | "focused" | "stopping" | "exiting";
  /** Extensions enabled on the instance, such as `"XR_EXT_hand_tracking"`. */
  readonly extensions: readonly string[];
  /** Whether the system reports hand tracking support. */
  readonly systemHandTracking: boolean;
  /**
   * The blend mode the session composites with, or `null` without a session:
   * `"opaque"` (no passthrough), `"alpha-blend"` or `"additive"`. Report what
   * the runtime actually submits, never a constant: `passthrough` is derived
   * from it.
   */
  readonly blendMode: EnvironmentBlendMode | null;
  /**
   * The WebXR feature names the session has ENABLED, translated from the
   * OpenXR extensions and features the app turned on: `"hand-tracking"`,
   * `"plane-detection"`, `"mesh-detection"`, `"anchors"`, `"hit-test"`,
   * `"depth-sensing"`. The capabilities read it as the IWSDK adapter reads
   * `XRSession.enabledFeatures` (`deriveCapabilities`): `planeDetection` is
   * true only when `"plane-detection"` is here. Optional; absent means none.
   */
  readonly features?: readonly string[];
}

/** Byte transport the native app provides. See `createNativeHostIO`. */
export interface NativeIOHost {
  /** Read a resource as bytes: a path in the app's content, or a URL. */
  fetchBytes(url: string): Promise<Uint8Array>;
  /** Decompress gzip bytes. */
  gunzip(bytes: Uint8Array): Promise<Uint8Array>;
}

/**
 * The part of the `input` slice this package reads: the source-change
 * signal, and the sources' kinds. The same slice
 * `@realitycollective/native-interactions` reads.
 */
export interface NativeInputSignals {
  /** A source connected or disconnected (WebXR `inputsourceschange`). The adapter re-derives on it. */
  onSourcesChanged(listener: () => void): () => void;
  /** This frame's sources; a `kind` of `"hand"` makes `handTracking` true, as a WebXR hand input source does. */
  sample?(): readonly { readonly kind: string }[];
}

/** Why the app could not start a session it was asked for. */
export type NativeSessionRefusal = "unsupported" | "denied" | "error";

/** The root of `globalThis.__rcHost`, as this package reads it. */
export interface NativeHost {
  /**
   * The app calls `callback` once per frame, after `xrWaitFrame`, with the
   * predicted display time in milliseconds and the seconds since the last
   * frame. It calls it in every live state; the adapter itself ticks
   * services only while the session is `focused`, as IWSDK's
   * `ServiceBridgeSystem` does.
   */
  onFrame(callback: (timestampMs: number, deltaS: number) => void): () => void;
  /** The session now. Read at construction and on every signal. */
  getSessionInfo(): NativeSessionInfo;
  /** The app calls `callback` on every session state, blend mode or feature change. */
  onSessionChange(callback: (info: NativeSessionInfo) => void): () => void;
  /**
   * Ask the app for a session. The answer arrives through `onSessionChange`
   * (the session going live) or `onSessionRefused` (it will not). A silent
   * app resolves the request as `timeout` after 10 000 ms.
   */
  requestSession(mode: SessionMode, optionsJson: string): void;
  /** Ask the app to end the session. */
  endSession(): void;
  /**
   * The app could not start a requested session: `"unsupported"` (the mode
   * or a required feature does not exist here), `"denied"` (the user
   * dismissed a permission prompt), or `"error"`, with an optional sentence
   * for a human. The pending request resolves with that reason at once,
   * instead of waiting for the timeout.
   */
  onSessionRefused?(callback: (reason: NativeSessionRefusal, detail?: string) => void): () => void;
  /** The `input` slice's source-change signal. Optional: without it capabilities re-derive on session changes only. */
  readonly input?: NativeInputSignals;
  /** Byte transport. Optional: only a host that serves assets needs it. */
  readonly io?: NativeIOHost;
}

/**
 * The host object the native app installed, or an error that says it did not.
 * Pass `host` to use an injected one instead, as tests do.
 */
export function getNativeHost(host?: NativeHost): NativeHost {
  const found = host ?? (globalThis as Record<string, unknown>)[NATIVE_HOST_GLOBAL];

  if (!found) {
    throw new Error(
      `No native host: globalThis.${NATIVE_HOST_GLOBAL} is not installed. The native app must install it before the bundle is evaluated.`
    );
  }

  return found as NativeHost;
}
