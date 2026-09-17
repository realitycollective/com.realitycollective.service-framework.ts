import { afterEach, describe, it, expect, vi } from "vitest";
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_SESSION_TIMEOUT_MS,
  IWSDKAdapter,
  type AdapterCapabilities,
  type FrameInfo,
  type IWSDKWorldLike,
  type SessionState,
  type SessionVisibility,
} from "../src/index.js";
import { createEventfulSession, createHost } from "./helpers/fake-world.js";

// Structural stand-in for an IWSDK World - no @iwsdk/core import needed.
const world: IWSDKWorldLike = { visibilityState: { value: "visible" } };

afterEach(() => {
  vi.useRealTimers();
});

describe("IWSDKAdapter frames", () => {
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

  it("exposes the bound world via getWorld()", () => {
    const adapter = new IWSDKAdapter(world);
    expect(adapter.getWorld()).toBe(world);
  });
});

describe("IWSDKAdapter capability derivation", () => {
  it("reports DEFAULT_CAPABILITIES while there is no session", () => {
    const adapter = new IWSDKAdapter(createHost().world);
    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);
  });

  it("reports immersive and nothing else for a bare session", () => {
    const host = createHost("push", { inputSources: [] });
    const adapter = new IWSDKAdapter(host.world);

    expect(adapter.getCapabilities()).toEqual({
      immersive: true,
      handTracking: false,
      planeDetection: false,
      passthrough: false,
      environmentBlendMode: null,
    });
  });

  it("derives handTracking and planeDetection from enabled features", () => {
    const host = createHost("push", {
      enabledFeatures: ["hand-tracking", "plane-detection"],
      inputSources: [],
    });
    const adapter = new IWSDKAdapter(host.world);

    expect(adapter.getCapabilities().handTracking).toBe(true);
    expect(adapter.getCapabilities().planeDetection).toBe(true);
  });

  it("derives handTracking from an input source carrying a hand", () => {
    const host = createHost("push", {
      enabledFeatures: ["plane-detection"],
      inputSources: [{}, { hand: {} }],
    });
    const adapter = new IWSDKAdapter(host.world);

    expect(adapter.getCapabilities().handTracking).toBe(true);
  });

  it("treats an opaque blend mode as no passthrough", () => {
    const host = createHost("push", { environmentBlendMode: "opaque", inputSources: [] });
    expect(new IWSDKAdapter(host.world).getCapabilities().passthrough).toBe(false);
  });

  it("treats any other blend mode as passthrough", () => {
    const host = createHost("push", { environmentBlendMode: "additive", inputSources: [] });
    expect(new IWSDKAdapter(host.world).getCapabilities().passthrough).toBe(true);
  });

  it("surfaces the blend mode itself, and notifies when only it changes", () => {
    const host = createHost("push", { environmentBlendMode: "alpha-blend", inputSources: [] });
    const adapter = new IWSDKAdapter(host.world);
    expect(adapter.getCapabilities().environmentBlendMode).toBe("alpha-blend");
    const seen: AdapterCapabilities[] = [];
    adapter.onCapabilitiesChange((capabilities) => seen.push(capabilities));

    // Every other flag is identical across these two sessions, so this is the
    // one change the comparison could miss.
    host.setSession({ environmentBlendMode: "additive", inputSources: [] });

    expect(seen).toHaveLength(1);
    expect(seen[0]!.environmentBlendMode).toBe("additive");
    expect(seen[0]!.passthrough).toBe(true);
  });

  it("re-derives when the visibility signal fires, and notifies once", () => {
    const host = createHost();
    const adapter = new IWSDKAdapter(host.world);
    const seen: AdapterCapabilities[] = [];
    adapter.onCapabilitiesChange((capabilities) => seen.push(capabilities));

    host.setSession({ enabledFeatures: ["hand-tracking"], inputSources: [] });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      immersive: true,
      handTracking: true,
      planeDetection: false,
      passthrough: false,
      environmentBlendMode: null,
    });
  });

  it("does not notify when a signal fires without changing anything", () => {
    const host = createHost();
    const adapter = new IWSDKAdapter(host.world);
    let calls = 0;
    adapter.onCapabilitiesChange(() => calls++);

    host.setSession({ inputSources: [] });
    host.fire();
    host.fire();

    expect(calls).toBe(1);
  });

  it("stops notifying onCapabilitiesChange after unsubscribe", () => {
    const host = createHost();
    const adapter = new IWSDKAdapter(host.world);
    let calls = 0;
    const unsubscribe = adapter.onCapabilitiesChange(() => calls++);

    host.setSession({ inputSources: [] });
    unsubscribe();
    host.setSession(null);

    expect(calls).toBe(1);
  });

  it("refreshCapabilities() derives on a host whose signal cannot push", () => {
    const host = createHost("poll");
    const adapter = new IWSDKAdapter(host.world);
    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);

    host.setSessionQuietly({ inputSources: [] });
    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);

    adapter.refreshCapabilities();

    expect(adapter.getCapabilities().immersive).toBe(true);
  });
});

describe("IWSDKAdapter input source changes", () => {
  it("binds a session the world already carries and re-derives on its event", () => {
    const session = createEventfulSession();
    const adapter = new IWSDKAdapter(createHost("push", session).world);

    session.changeInputSources([{ hand: {} }]);

    expect(adapter.getCapabilities().handTracking).toBe(true);
  });

  it("re-derives when a session that arrived later raises inputsourceschange", () => {
    const host = createHost();
    const session = createEventfulSession();
    const adapter = new IWSDKAdapter(host.world);
    host.setSession(session);
    const seen: AdapterCapabilities[] = [];
    adapter.onCapabilitiesChange((capabilities) => seen.push(capabilities));

    session.changeInputSources([{ hand: {} }]);

    expect(seen).toHaveLength(1);
    expect(seen[0]!.handTracking).toBe(true);
  });

  it("detaches the listener when the session goes away", () => {
    const host = createHost();
    const session = createEventfulSession();
    const adapter = new IWSDKAdapter(host.world);
    host.setSession(session);
    expect(session.listeners.size).toBe(1);

    host.setSession(null);

    expect(session.listeners.size).toBe(0);
    expect(adapter.getCapabilities().immersive).toBe(false);
  });

  it("moves the listener when one session replaces another", () => {
    const host = createHost();
    const first = createEventfulSession();
    const second = createEventfulSession();
    const adapter = new IWSDKAdapter(host.world);

    host.setSession(first);
    host.setSession(second);
    second.changeInputSources([{ hand: {} }]);

    expect(first.listeners.size).toBe(0);
    expect(second.listeners.size).toBe(1);
    expect(adapter.getCapabilities().handTracking).toBe(true);
  });

  it("detaches the session listener on dispose", () => {
    const session = createEventfulSession();
    const adapter = new IWSDKAdapter(createHost("push", session).world);

    adapter.dispose();

    expect(session.listeners.size).toBe(0);
  });

  it("is safe on a session that carries no listener methods", () => {
    const host = createHost();
    const adapter = new IWSDKAdapter(host.world);

    expect(() => host.setSession({ inputSources: [] })).not.toThrow();
    expect(adapter.getCapabilities().immersive).toBe(true);
    expect(() => host.setSession(null)).not.toThrow();
    expect(adapter.getCapabilities().immersive).toBe(false);
  });
});

describe("IWSDKAdapter capability overrides", () => {
  it("setCapabilities merges a partial over the current capabilities", () => {
    const adapter = new IWSDKAdapter(createHost().world);
    adapter.setCapabilities({ immersive: true });
    adapter.setCapabilities({ passthrough: true });

    expect(adapter.getCapabilities()).toEqual({
      immersive: true,
      handTracking: false,
      planeDetection: false,
      passthrough: true,
      environmentBlendMode: null,
    });
  });

  it("notifies onCapabilitiesChange subscribers with the merged capabilities", () => {
    const adapter = new IWSDKAdapter(createHost().world);
    const seen: AdapterCapabilities[] = [];
    adapter.onCapabilitiesChange((caps) => seen.push(caps));

    adapter.setCapabilities({ immersive: true });

    expect(seen).toHaveLength(1);
    expect(seen[0]!.immersive).toBe(true);
    expect(seen[0]!.passthrough).toBe(false);
  });

  it("does not notify when an override changes nothing", () => {
    const adapter = new IWSDKAdapter(createHost().world);
    let calls = 0;
    adapter.onCapabilitiesChange(() => calls++);

    adapter.setCapabilities({ immersive: false });

    expect(calls).toBe(0);
  });

  it("keeps an override in place across later derivations", () => {
    const host = createHost();
    const adapter = new IWSDKAdapter(host.world);
    adapter.setCapabilities({ passthrough: true });

    host.setSession({ environmentBlendMode: "opaque", inputSources: [] });

    expect(adapter.getCapabilities().passthrough).toBe(true);
    expect(adapter.getCapabilities().immersive).toBe(true);
  });

  it("clearCapabilityOverrides falls back to the derived values", () => {
    const host = createHost();
    const adapter = new IWSDKAdapter(host.world);
    adapter.setCapabilities({ passthrough: true });
    host.setSession({ environmentBlendMode: "opaque", inputSources: [] });

    adapter.clearCapabilityOverrides();

    expect(adapter.getCapabilities().passthrough).toBe(false);
    expect(adapter.getCapabilities().immersive).toBe(true);
  });
});

describe("IWSDKAdapter session facet", () => {
  it("starts at none with no session and active with one", () => {
    expect(new IWSDKAdapter(createHost().world).session.getState()).toBe("none");
    expect(
      new IWSDKAdapter(createHost("push", { inputSources: [] }).world).session.getState(),
    ).toBe("active");
  });

  it("reports unsupported when the world has no launchXR", async () => {
    const adapter = new IWSDKAdapter(createHost().world);
    expect(await adapter.session.request("immersive-vr")).toEqual({
      ok: false,
      reason: "unsupported",
    });
    expect(adapter.session.getState()).toBe("none");
  });

  it("reports ok immediately when a session is already active", async () => {
    const host = createHost("push", { inputSources: [] });
    host.enableLaunch();
    const adapter = new IWSDKAdapter(host.world);

    expect(await adapter.session.request("immersive-vr")).toEqual({ ok: true });
    expect(host.launches).toEqual([]);
  });

  it("maps a synchronous launchXR throw to unsupported and keeps the error", async () => {
    const host = createHost();
    const failure = new Error("no XR device");
    host.enableLaunch(() => {
      throw failure;
    });
    const adapter = new IWSDKAdapter(host.world);

    const result = await adapter.session.request("immersive-ar");

    expect(result).toEqual({ ok: false, reason: "unsupported", error: failure });
    expect(adapter.session.getState()).toBe("none");
  });

  it("resolves ok when the session appears synchronously inside launchXR", async () => {
    const host = createHost();
    host.enableLaunch(() => host.setSessionQuietly({ inputSources: [] }));
    const adapter = new IWSDKAdapter(host.world);

    expect(await adapter.session.request("immersive-vr")).toEqual({ ok: true });
    expect(adapter.session.getState()).toBe("active");
    expect(adapter.getCapabilities().immersive).toBe(true);
  });

  it("passes the requested mode to launchXR", async () => {
    const host = createHost();
    host.enableLaunch(() => host.setSessionQuietly({ inputSources: [] }));
    const adapter = new IWSDKAdapter(host.world);

    await adapter.session.request("immersive-ar");

    expect(host.launches).toEqual([{ sessionMode: "immersive-ar" }]);
  });

  it("maps the request's features onto IWSDK's structured flags", async () => {
    const host = createHost();
    host.enableLaunch(() => host.setSessionQuietly({ inputSources: [] }));
    const adapter = new IWSDKAdapter(host.world);

    await adapter.session.request("immersive-ar", {
      requiredFeatures: ["hand-tracking"],
      // "local-floor" has no IWSDK key: it is dropped, not thrown.
      optionalFeatures: ["layers", "local-floor"],
    });

    expect(host.launches).toEqual([
      {
        sessionMode: "immersive-ar",
        features: { handTracking: { required: true }, layers: true },
      },
    ]);
  });

  it("resolves ok when the session arrives on a later visibility signal", async () => {
    const host = createHost();
    host.enableLaunch();
    const adapter = new IWSDKAdapter(host.world);
    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    const pending = adapter.session.request("immersive-vr");
    host.fire(); // a signal with no session yet - the wait must not settle
    expect(adapter.session.getState()).toBe("requesting");

    host.setSession({ inputSources: [] });

    expect(await pending).toEqual({ ok: true });
    expect(states).toEqual(["requesting", "active"]);
  });

  it("resolves ok through the polling fallback when the signal cannot push", async () => {
    vi.useFakeTimers();
    const host = createHost("poll");
    host.enableLaunch(() => {
      setTimeout(() => host.setSessionQuietly({ inputSources: [] }), 120);
    });
    const adapter = new IWSDKAdapter(host.world);

    const pending = adapter.session.request("immersive-vr");
    await vi.advanceTimersByTimeAsync(200);

    expect(await pending).toEqual({ ok: true });
    expect(adapter.session.getState()).toBe("active");
  });

  it("times out when no session ever appears", async () => {
    vi.useFakeTimers();
    const host = createHost();
    host.enableLaunch();
    const adapter = new IWSDKAdapter(host.world);

    const pending = adapter.session.request("immersive-vr", { timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(500);

    expect(await pending).toEqual({ ok: false, reason: "timeout" });
    expect(adapter.session.getState()).toBe("none");
  });

  it("times out after DEFAULT_SESSION_TIMEOUT_MS when none is supplied", async () => {
    vi.useFakeTimers();
    const host = createHost();
    host.enableLaunch();
    const adapter = new IWSDKAdapter(host.world);

    const pending = adapter.session.request("immersive-vr");
    await vi.advanceTimersByTimeAsync(DEFAULT_SESSION_TIMEOUT_MS);

    expect(await pending).toEqual({ ok: false, reason: "timeout" });
  });

  it("end() with no session is a no-op", async () => {
    const adapter = new IWSDKAdapter(createHost().world);
    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    await adapter.session.end();

    expect(states).toEqual([]);
  });

  it("end() calls exitXR and settles once the session is gone", async () => {
    const host = createHost("push", { inputSources: [] });
    host.enableExit(() => host.setSessionQuietly(null));
    const adapter = new IWSDKAdapter(host.world);
    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    await adapter.session.end();

    expect(host.counters.exits).toBe(1);
    expect(states).toEqual(["ending", "none"]);
    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);
  });

  it("end() without exitXR still settles once the host drops the session", async () => {
    const host = createHost("push", { inputSources: [] });
    const adapter = new IWSDKAdapter(host.world);
    host.setSessionQuietly(null);

    await adapter.session.end();

    expect(adapter.session.getState()).toBe("none");
  });

  it("ignores visibility signals while a session is ending", async () => {
    const host = createHost("push", { inputSources: [] });
    host.enableExit(); // exits, but the session lingers until the host clears it
    const adapter = new IWSDKAdapter(host.world);

    const ending = adapter.session.end();
    host.fire();
    expect(adapter.session.getState()).toBe("ending");

    host.setSession(null);
    await ending;

    expect(adapter.session.getState()).toBe("none");
  });

  it("follows the host when a session appears or disappears on its own", () => {
    const host = createHost();
    const adapter = new IWSDKAdapter(host.world);

    host.setSession({ inputSources: [] });
    expect(adapter.session.getState()).toBe("active");

    host.setSession(null);
    expect(adapter.session.getState()).toBe("none");
  });

  it("maps the visibility signal onto SessionVisibility, unknown values as hidden", () => {
    const host = createHost();
    const adapter = new IWSDKAdapter(host.world);
    const seen: SessionVisibility[] = [];
    const unsubscribe = adapter.session.onVisibilityChange((visibility) => seen.push(visibility));

    host.setVisibility("visible");
    host.setVisibility("visible-blurred");
    host.setVisibility("sleeping");
    host.setVisibility(42);
    unsubscribe();
    host.setVisibility("hidden");

    expect(seen).toEqual(["visible", "visible-blurred", "hidden", "hidden"]);
  });

  it("stops notifying onStateChange after unsubscribe", () => {
    const host = createHost();
    const adapter = new IWSDKAdapter(host.world);
    const states: SessionState[] = [];
    const unsubscribe = adapter.session.onStateChange((state) => states.push(state));

    unsubscribe();
    host.setSession({ inputSources: [] });

    expect(states).toEqual([]);
  });
});

describe("IWSDKAdapter dispose", () => {
  it("unsubscribes from the visibility signal and stops fanning out frames", () => {
    const host = createHost();
    const adapter = new IWSDKAdapter(host.world);
    let frames = 0;
    adapter.onFrame(() => frames++);

    adapter.dispose();
    adapter.emitFrame(0, 0);
    host.setSession({ inputSources: [] });

    expect(host.counters.unsubscribes).toBe(1);
    expect(frames).toBe(0);
    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);
  });

  it("is safe on a host whose signal has no subscribe", () => {
    const adapter = new IWSDKAdapter(createHost("poll").world);
    expect(() => adapter.dispose()).not.toThrow();
  });

  it("drops capability overrides", () => {
    const adapter = new IWSDKAdapter(createHost().world);
    adapter.setCapabilities({ immersive: true });

    adapter.dispose();
    adapter.refreshCapabilities();

    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);
  });

  it("settles an in-flight session request as a timeout", async () => {
    const host = createHost();
    host.enableLaunch();
    const adapter = new IWSDKAdapter(host.world);

    const pending = adapter.session.request("immersive-vr");
    adapter.dispose();

    expect(await pending).toEqual({ ok: false, reason: "timeout" });
  });
});
