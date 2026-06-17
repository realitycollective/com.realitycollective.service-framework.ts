/**
 * Runtime adapter contract (IWSDK-only, minimal frame-source).
 *
 * Trimmed to what an IWSDK-only client needs: a per-frame fan-out and
 * capability flags. IWSDK already owns sessions, input and rendering, so the
 * adapter deliberately does NOT re-abstract those. {@link MockRuntimeAdapter}
 * implements this same interface so services can be unit-tested headless.
 */

export type Unsubscribe = () => void;

export interface FrameInfo {
  /** Frame timestamp in milliseconds (IWSDK system `time`). */
  readonly timestamp: number;
  /** Seconds elapsed since the previous frame (IWSDK system `delta`). */
  readonly delta: number;
}

/** XR capabilities services gate on (e.g. passthrough requires `immersive`). */
export interface AdapterCapabilities {
  readonly immersive: boolean;
  readonly handTracking: boolean;
  readonly planeDetection: boolean;
  readonly passthrough: boolean;
}

export const DEFAULT_CAPABILITIES: AdapterCapabilities = {
  immersive: false,
  handTracking: false,
  planeDetection: false,
  passthrough: false,
};

export type FrameListener = (frame: FrameInfo) => void;
export type CapabilitiesListener = (capabilities: AdapterCapabilities) => void;

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
}
