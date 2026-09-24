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
  /** The OpenXR `XrSessionState` name, or `"none"` before a session exists. */
  readonly state: "none" | "idle" | "ready" | "synchronized" | "visible" | "focused" | "stopping" | "exiting";
  /** Extensions enabled on the instance, such as `"XR_EXT_hand_tracking"`. */
  readonly extensions: readonly string[];
  /** Whether the system reports hand tracking support. */
  readonly systemHandTracking: boolean;
  /** The blend mode the session composites with, or `null` without a session. */
  readonly blendMode: EnvironmentBlendMode | null;
}

/** Byte transport the native app provides. See `createNativeHostIO`. */
export interface NativeIOHost {
  /** Read a resource as bytes: a path in the app's content, or a URL. */
  fetchBytes(url: string): Promise<Uint8Array>;
  /** Decompress gzip bytes. */
  gunzip(bytes: Uint8Array): Promise<Uint8Array>;
}

/** The root of `globalThis.__rcHost`, as this package reads it. */
export interface NativeHost {
  /** The app calls `callback` once per frame, after `xrWaitFrame`. */
  onFrame(callback: (timestampMs: number, deltaS: number) => void): () => void;
  getSessionInfo(): NativeSessionInfo;
  /** The app calls `callback` on every session state change. */
  onSessionChange(callback: (info: NativeSessionInfo) => void): () => void;
  /** Ask the app for a session. The answer arrives through `onSessionChange`. */
  requestSession(mode: SessionMode, optionsJson: string): void;
  /** Ask the app to end the session. */
  endSession(): void;
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
