import { describe, it, expect } from "vitest";
import {
  DEFAULT_CAPABILITIES,
  IWSDKAdapter,
  type AdapterCapabilities,
  type FrameInfo,
  type IWSDKWorldLike,
} from "../src/index.js";

// Structural stand-in for an IWSDK World — no @iwsdk/core import needed.
const world: IWSDKWorldLike = { visibilityState: { value: "visible" } };

describe("IWSDKAdapter", () => {
  it("fans out each frame to every subscriber", () => {
    const adapter = new IWSDKAdapter(world);
    const a: FrameInfo[] = [];
    const b: FrameInfo[] = [];
    adapter.onFrame((frame) => a.push(frame));
    adapter.onFrame((frame) => b.push(frame));

    adapter.emitFrame(100, 1 / 72);

    expect(a).toEqual([{ timestamp: 100, delta: 1 / 72 }]);
    expect(b).toEqual([{ timestamp: 100, delta: 1 / 72 }]);
  });

  it("stops notifying a listener after it unsubscribes", () => {
    const adapter = new IWSDKAdapter(world);
    const frames: FrameInfo[] = [];
    const unsubscribe = adapter.onFrame((frame) => frames.push(frame));

    adapter.emitFrame(1, 0.5);
    unsubscribe();
    adapter.emitFrame(2, 0.5);

    expect(frames).toHaveLength(1);
    expect(frames[0]!.timestamp).toBe(1);
  });

  it("emitFrame with no listeners is a no-op", () => {
    const adapter = new IWSDKAdapter(world);
    expect(() => adapter.emitFrame(0, 0)).not.toThrow();
  });

  it("starts with all capabilities false (DEFAULT_CAPABILITIES)", () => {
    const adapter = new IWSDKAdapter(world);
    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);
  });

  it("setCapabilities merges a partial over the current capabilities", () => {
    const adapter = new IWSDKAdapter(world);
    adapter.setCapabilities({ immersive: true });
    adapter.setCapabilities({ passthrough: true });

    expect(adapter.getCapabilities()).toEqual({
      immersive: true,
      handTracking: false,
      planeDetection: false,
      passthrough: true,
    });
  });

  it("notifies onCapabilitiesChange subscribers with the merged capabilities", () => {
    const adapter = new IWSDKAdapter(world);
    const seen: AdapterCapabilities[] = [];
    adapter.onCapabilitiesChange((caps) => seen.push(caps));

    adapter.setCapabilities({ immersive: true });

    expect(seen).toHaveLength(1);
    expect(seen[0]!.immersive).toBe(true);
    expect(seen[0]!.passthrough).toBe(false);
  });

  it("stops notifying onCapabilitiesChange after unsubscribe", () => {
    const adapter = new IWSDKAdapter(world);
    let calls = 0;
    const unsubscribe = adapter.onCapabilitiesChange(() => calls++);

    adapter.setCapabilities({ immersive: true });
    unsubscribe();
    adapter.setCapabilities({ handTracking: true });

    expect(calls).toBe(1);
  });

  it("exposes the bound world via getWorld()", () => {
    const adapter = new IWSDKAdapter(world);
    expect(adapter.getWorld()).toBe(world);
  });
});
