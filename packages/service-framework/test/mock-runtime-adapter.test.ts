import { afterEach, describe, it, expect, vi } from "vitest";
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_SESSION_TIMEOUT_MS,
  MockRuntimeAdapter,
  type FrameInfo,
  type SessionState,
  type SessionVisibility,
} from "../src/index.js";

afterEach(() => {
  vi.useRealTimers();
});

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

  it("stops notifying onCapabilitiesChange after unsubscribe", () => {
    const adapter = new MockRuntimeAdapter();
    let calls = 0;
    const unsubscribe = adapter.onCapabilitiesChange(() => calls++);

    adapter.setCapabilities({ immersive: true });
    unsubscribe();
    adapter.setCapabilities({ handTracking: true });

    expect(calls).toBe(1);
  });
});

describe("MockRuntimeAdapter session facet", () => {
  it("starts with no session", () => {
    expect(new MockRuntimeAdapter().session.getState()).toBe("none");
  });

  it("resolves a request as ok when a session start is simulated", async () => {
    const adapter = new MockRuntimeAdapter();
    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    const pending = adapter.session.request("immersive-vr");
    expect(adapter.session.getState()).toBe("requesting");

    adapter.simulateSessionStart();

    expect(await pending).toEqual({ ok: true });
    expect(states).toEqual(["requesting", "active"]);
  });

  it("resolves an already-active request immediately without a state change", async () => {
    const adapter = new MockRuntimeAdapter();
    adapter.simulateSessionStart();

    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    expect(await adapter.session.request("immersive-ar")).toEqual({ ok: true });
    expect(states).toEqual([]);
  });

  it("times out after the supplied timeout and returns to no session", async () => {
    vi.useFakeTimers();
    const adapter = new MockRuntimeAdapter();

    const pending = adapter.session.request("inline", { timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(500);

    expect(await pending).toEqual({ ok: false, reason: "timeout" });
    expect(adapter.session.getState()).toBe("none");
  });

  it("times out after DEFAULT_SESSION_TIMEOUT_MS when no timeout is supplied", async () => {
    vi.useFakeTimers();
    const adapter = new MockRuntimeAdapter();

    const pending = adapter.session.request("immersive-vr");
    await vi.advanceTimersByTimeAsync(DEFAULT_SESSION_TIMEOUT_MS - 1);
    expect(adapter.session.getState()).toBe("requesting");

    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual({ ok: false, reason: "timeout" });
  });

  it("simulateSessionStart with no request pending just goes active", () => {
    const adapter = new MockRuntimeAdapter();
    adapter.simulateSessionStart();
    expect(adapter.session.getState()).toBe("active");
  });

  it("simulateSessionEnd drops the session from the host side", () => {
    const adapter = new MockRuntimeAdapter();
    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    adapter.simulateSessionStart();
    adapter.simulateSessionEnd();

    expect(states).toEqual(["active", "none"]);
    expect(adapter.session.getState()).toBe("none");
  });

  it("end() walks active -> ending -> none", async () => {
    const adapter = new MockRuntimeAdapter();
    adapter.simulateSessionStart();

    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    await adapter.session.end();

    expect(states).toEqual(["ending", "none"]);
    expect(adapter.session.getState()).toBe("none");
  });

  it("end() with no session is a no-op", async () => {
    const adapter = new MockRuntimeAdapter();
    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    await adapter.session.end();

    expect(states).toEqual([]);
  });

  it("ignores a repeated transition to the state it is already in", () => {
    const adapter = new MockRuntimeAdapter();
    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    adapter.simulateSessionStart();
    adapter.simulateSessionStart();

    expect(states).toEqual(["active"]);
  });

  it("stops notifying onStateChange after unsubscribe", () => {
    const adapter = new MockRuntimeAdapter();
    const states: SessionState[] = [];
    const unsubscribe = adapter.session.onStateChange((state) => states.push(state));

    unsubscribe();
    adapter.simulateSessionStart();

    expect(states).toEqual([]);
  });

  it("pushes simulated visibility to subscribers and stops after unsubscribe", () => {
    const adapter = new MockRuntimeAdapter();
    const seen: SessionVisibility[] = [];
    const unsubscribe = adapter.session.onVisibilityChange((visibility) => seen.push(visibility));

    adapter.simulateVisibility("visible");
    adapter.simulateVisibility("hidden");
    unsubscribe();
    adapter.simulateVisibility("visible-blurred");

    expect(seen).toEqual(["visible", "hidden"]);
  });
});
