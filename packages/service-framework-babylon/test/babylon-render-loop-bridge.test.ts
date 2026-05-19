import { describe, it, expect, vi, beforeEach } from "vitest";
import { ManualScheduler } from "@realitycollective/service-framework";
import type { LifecycleContext } from "@realitycollective/service-framework";
import { BabylonRenderLoopBridge } from "../src/index.js";

/**
 * Minimal engine mock. Stores the last callback passed to runRenderLoop so
 * triggerFrame() can fire it synchronously — no real WebGL or browser needed.
 *
 * Mirrors the host-interface pattern used by ThreeRenderLoopBridge tests.
 */
function makeMockHost() {
  let storedCallback: (() => void) | null = null;
  return {
    runRenderLoop: vi.fn((cb: () => void) => {
      storedCallback = cb;
    }),
    stopRenderLoop: vi.fn((_cb: () => void) => {
      storedCallback = null;
    }),
    triggerFrame() {
      storedCallback?.();
    },
  };
}

describe("BabylonRenderLoopBridge", () => {
  let scheduler: ManualScheduler;
  let host: ReturnType<typeof makeMockHost>;
  let bridge: BabylonRenderLoopBridge;
  let ticks: LifecycleContext[];

  beforeEach(() => {
    scheduler = new ManualScheduler();
    host = makeMockHost();
    bridge = new BabylonRenderLoopBridge({ scheduler, host });
    ticks = [];
    scheduler.subscribe("renderTick", (ctx) => ticks.push(ctx));
  });

  it("is not running before start() is called", () => {
    expect(bridge.isRunning).toBe(false);
  });

  it("calls host.runRenderLoop on start()", () => {
    bridge.start();
    expect(host.runRenderLoop).toHaveBeenCalledOnce();
    expect(bridge.isRunning).toBe(true);
  });

  it("emits renderTick on each engine frame", () => {
    bridge.start();
    host.triggerFrame();
    host.triggerFrame();
    expect(ticks).toHaveLength(2);
  });

  it("increments frame counter monotonically from 1", () => {
    bridge.start();
    host.triggerFrame();
    host.triggerFrame();
    host.triggerFrame();
    expect(ticks[0]!.frame).toBe(1);
    expect(ticks[1]!.frame).toBe(2);
    expect(ticks[2]!.frame).toBe(3);
  });

  it("currentFrame reflects the most recently emitted frame", () => {
    bridge.start();
    host.triggerFrame();
    host.triggerFrame();
    expect(bridge.currentFrame).toBe(2);
  });

  it("uses 16 ms as first-frame deltaTime", () => {
    // The first frame delta cannot be computed from performance.now() because
    // lastTimestamp starts at 0 (epoch), not at engine-start. Defaulting to
    // 16 ms (one 60 fps frame) is the same convention as ThreeRenderLoopBridge.
    bridge.start();
    host.triggerFrame();
    expect(ticks[0]!.deltaTime).toBe(16);
  });

  it("emits deltaTime > 0 on subsequent frames", async () => {
    bridge.start();
    host.triggerFrame();
    await new Promise((r) => setTimeout(r, 10));
    host.triggerFrame();
    expect(ticks[1]!.deltaTime).toBeGreaterThan(0);
  });

  it("emits deltaTime in milliseconds, not seconds", async () => {
    bridge.start();
    host.triggerFrame();
    await new Promise((r) => setTimeout(r, 50));
    host.triggerFrame();
    // 50 ms gap → deltaTime ~50, definitely > 1; seconds would be ~0.05
    expect(ticks[1]!.deltaTime).toBeGreaterThan(1);
  });

  it("always emits source: 'babylon'", () => {
    bridge.start();
    host.triggerFrame();
    expect(ticks[0]!.source).toBe("babylon");
  });

  it("emits a positive numeric timestamp", () => {
    bridge.start();
    host.triggerFrame();
    expect(typeof ticks[0]!.timestamp).toBe("number");
    expect(ticks[0]!.timestamp).toBeGreaterThan(0);
  });

  it("stop() calls host.stopRenderLoop and sets isRunning to false", () => {
    bridge.start();
    bridge.stop();
    expect(host.stopRenderLoop).toHaveBeenCalledOnce();
    expect(bridge.isRunning).toBe(false);
  });

  it("stop() before start() is a no-op", () => {
    bridge.stop();
    expect(host.stopRenderLoop).not.toHaveBeenCalled();
  });

  it("start() is idempotent — duplicate calls do not register a second callback", () => {
    bridge.start();
    bridge.start();
    expect(host.runRenderLoop).toHaveBeenCalledOnce();
  });

  it("stop() is idempotent — duplicate calls do not throw", () => {
    bridge.start();
    bridge.stop();
    expect(() => bridge.stop()).not.toThrow();
    expect(host.stopRenderLoop).toHaveBeenCalledOnce();
  });

  it("does not emit after stop()", () => {
    bridge.start();
    host.triggerFrame();
    bridge.stop();
    host.triggerFrame(); // storedCallback is null — no emission
    expect(ticks).toHaveLength(1);
  });

  it("can restart after stop() and frame counter continues", () => {
    bridge.start();
    host.triggerFrame();        // frame 1
    bridge.stop();
    bridge.start();
    host.triggerFrame();        // frame 2 — counter persists across restart
    expect(ticks).toHaveLength(2);
    expect(ticks[1]!.frame).toBe(2);
  });

  it("dispose() is an alias for stop()", () => {
    bridge.start();
    bridge.dispose();
    expect(bridge.isRunning).toBe(false);
    expect(host.stopRenderLoop).toHaveBeenCalledOnce();
  });
});
