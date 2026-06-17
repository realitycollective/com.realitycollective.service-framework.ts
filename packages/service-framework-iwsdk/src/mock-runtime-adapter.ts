/**
 * Headless {@link RuntimeAdapter} for tests. Services run against this with no
 * IWSDK / renderer / headset; tests drive the loop by calling
 * {@link MockRuntimeAdapter.emitFrame} and refine gating with
 * {@link MockRuntimeAdapter.setCapabilities}.
 */
import {
  DEFAULT_CAPABILITIES,
  type AdapterCapabilities,
  type CapabilitiesListener,
  type FrameListener,
  type RuntimeAdapter,
  type Unsubscribe,
} from "./runtime-adapter.js";

export class MockRuntimeAdapter implements RuntimeAdapter {
  private readonly frameListeners = new Set<FrameListener>();
  private readonly capabilitiesListeners = new Set<CapabilitiesListener>();
  private capabilities: AdapterCapabilities;

  public constructor(capabilities: Partial<AdapterCapabilities> = {}) {
    this.capabilities = { ...DEFAULT_CAPABILITIES, ...capabilities };
  }

  public onFrame(listener: FrameListener): Unsubscribe {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  public getCapabilities(): AdapterCapabilities {
    return this.capabilities;
  }

  public onCapabilitiesChange(listener: CapabilitiesListener): Unsubscribe {
    this.capabilitiesListeners.add(listener);
    return () => {
      this.capabilitiesListeners.delete(listener);
    };
  }

  /** Refine capabilities in tests; notifies subscribers. */
  public setCapabilities(capabilities: Partial<AdapterCapabilities>): void {
    this.capabilities = { ...this.capabilities, ...capabilities };
    this.capabilitiesListeners.forEach((listener) => listener(this.capabilities));
  }

  /** Drive a frame in tests. */
  public emitFrame(timestamp = 0, delta = 1 / 72): void {
    this.frameListeners.forEach((listener) => listener({ timestamp, delta }));
  }
}
