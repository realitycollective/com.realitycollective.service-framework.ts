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
      environmentBlendMode: null,
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

  it("resolves an already-active request for the same mode immediately without a state change", async () => {
    const adapter = new MockRuntimeAdapter();
    const pending = adapter.session.request("immersive-vr");
    adapter.simulateSessionStart();
    await pending;

    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    expect(await adapter.session.request("immersive-vr")).toEqual({ ok: true });
    expect(states).toEqual([]);
  });

  it("switches to a different mode by ending the live session and requesting the new one", async () => {
    const adapter = new MockRuntimeAdapter();
    const firstPending = adapter.session.request("immersive-vr");
    adapter.simulateSessionStart();
    await firstPending;

    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    const secondPending = adapter.session.request("immersive-ar");
    expect(adapter.session.getState()).toBe("requesting");
    adapter.simulateSessionStart();

    expect(await secondPending).toEqual({ ok: true });
    expect(states).toEqual(["ending", "none", "requesting", "active"]);
    expect(adapter.session.getMode()).toBe("immersive-ar");
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

  it("getMode reports null before a session, the requested mode while active, then null again", async () => {
    const adapter = new MockRuntimeAdapter();
    expect(adapter.session.getMode()).toBeNull();

    const pending = adapter.session.request("immersive-ar");
    adapter.simulateSessionStart();
    await pending;
    expect(adapter.session.getMode()).toBe("immersive-ar");

    await adapter.session.end();
    expect(adapter.session.getMode()).toBeNull();
  });

  it("getMode reports null for a session adopted with no request in flight", () => {
    const adapter = new MockRuntimeAdapter();
    adapter.simulateSessionStart();

    expect(adapter.session.getMode()).toBeNull();
  });

  it("isSupported defaults to both immersive modes and not inline", async () => {
    const adapter = new MockRuntimeAdapter();

    expect(await adapter.session.isSupported("immersive-vr")).toBe(true);
    expect(await adapter.session.isSupported("immersive-ar")).toBe(true);
    expect(await adapter.session.isSupported("inline")).toBe(false);
  });

  it("isSupported reads the modes given in the options", async () => {
    const adapter = new MockRuntimeAdapter({}, { supportedModes: ["inline"] });

    expect(await adapter.session.isSupported("inline")).toBe(true);
    expect(await adapter.session.isSupported("immersive-vr")).toBe(false);
  });

  it("recentre bumps recentreCount and never throws, with or without a session", () => {
    const adapter = new MockRuntimeAdapter();

    adapter.session.recentre();
    expect(adapter.recentreCount).toBe(1);

    adapter.simulateSessionStart();
    adapter.session.recentre();
    expect(adapter.recentreCount).toBe(2);
  });
});
