/**
 * IWSDK implementation of {@link RuntimeAdapter}. IWSDK owns the render loop, so
 * the adapter is a passive fan-out: the `ServiceBridgeSystem` (a normal IWSDK
 * system) calls {@link IWSDKAdapter.emitFrame} once per frame and the adapter
 * notifies subscribed services. Capabilities are refined from the XR session via
 * {@link IWSDKAdapter.setCapabilities}.
 */
import {
  DEFAULT_CAPABILITIES,
  type AdapterCapabilities,
  type CapabilitiesListener,
  type FrameInfo,
  type FrameListener,
  type RuntimeAdapter,
  type Unsubscribe,
} from "./runtime-adapter.js";
import type { IWSDKWorldLike } from "./iwsdk-host.js";

export class IWSDKAdapter implements RuntimeAdapter {
  private readonly frameListeners = new Set<FrameListener>();
  private readonly capabilitiesListeners = new Set<CapabilitiesListener>();
  private capabilities: AdapterCapabilities = DEFAULT_CAPABILITIES;

  public constructor(private readonly world: IWSDKWorldLike) {}

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

  /**
   * The IWSDK `World` this adapter is bound to. Reserved for capability
   * derivation from the live XR session (see the package README "Capabilities"
   * section) - the one piece still to be wired to the real IWSDK session API.
   */
  public getWorld(): IWSDKWorldLike {
    return this.world;
  }

  /** Refine capabilities once the XR session reports them; notifies subscribers. */
  public setCapabilities(capabilities: Partial<AdapterCapabilities>): void {
    this.capabilities = { ...this.capabilities, ...capabilities };
    this.capabilitiesListeners.forEach((listener) => listener(this.capabilities));
  }

  /** Called once per frame by the ECS bridge system. */
  public emitFrame(timestamp: number, delta: number): void {
    const frame: FrameInfo = { timestamp, delta };
    this.frameListeners.forEach((listener) => listener(frame));
  }
}
