import { describe, it, expect } from "vitest";
import {
  DEFAULT_CAPABILITIES,
  MockRuntimeAdapter,
  type FrameInfo,
} from "../src/index.js";

describe("MockRuntimeAdapter", () => {
  it("defaults to all-false capabilities", () => {
    expect(new MockRuntimeAdapter().getCapabilities()).toEqual(DEFAULT_CAPABILITIES);
  });

  it("merges constructor capability overrides over the defaults", () => {
    const adapter = new MockRuntimeAdapter({ immersive: true, passthrough: true });
    expect(adapter.getCapabilities()).toEqual({
      immersive: true,
      handTracking: false,
      planeDetection: false,
      passthrough: true,
    });
  });

  it("emitFrame() uses timestamp 0 and a 72 fps delta by default", () => {
    const adapter = new MockRuntimeAdapter();
    const frames: FrameInfo[] = [];
    adapter.onFrame((frame) => frames.push(frame));

    adapter.emitFrame();

    expect(frames[0]).toEqual({ timestamp: 0, delta: 1 / 72 });
  });

  it("emitFrame(timestamp, delta) forwards explicit values", () => {
    const adapter = new MockRuntimeAdapter();
    const frames: FrameInfo[] = [];
    adapter.onFrame((frame) => frames.push(frame));

    adapter.emitFrame(500, 0.25);

    expect(frames[0]).toEqual({ timestamp: 500, delta: 0.25 });
  });

  it("stops notifying a listener after it unsubscribes", () => {
    const adapter = new MockRuntimeAdapter();
    let calls = 0;
    const unsubscribe = adapter.onFrame(() => calls++);

    adapter.emitFrame();
    unsubscribe();
    adapter.emitFrame();

    expect(calls).toBe(1);
  });

  it("notifies onCapabilitiesChange when capabilities are refined", () => {
    const adapter = new MockRuntimeAdapter();
    let immersive = false;
    adapter.onCapabilitiesChange((caps) => (immersive = caps.immersive));

    adapter.setCapabilities({ immersive: true });

    expect(immersive).toBe(true);
    expect(adapter.getCapabilities().immersive).toBe(true);
  });
});
