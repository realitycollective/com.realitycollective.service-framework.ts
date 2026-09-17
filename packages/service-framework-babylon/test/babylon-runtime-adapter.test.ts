import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_SESSION_TIMEOUT_MS,
  ManualScheduler,
  type AdapterCapabilities,
  type FrameInfo,
  type SessionState,
  type SessionVisibility
} from "@realitycollective/service-framework";
import { BABYLON_WEBXR_STATE, BabylonRuntimeAdapter } from "../src/index.js";
import { createFakeBabylonXR, createFakeEngineHost } from "./helpers/fake-babylon-xr.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The common wiring: a fake `WebXRDefaultExperience.baseExperience`. */
function createSubject(hostOptions: Parameters<typeof createFakeBabylonXR>[0] = {}) {
  const host = createFakeBabylonXR(hostOptions);
  const adapter = new BabylonRuntimeAdapter({ xr: host.experience });

  return { host, adapter };
}

describe("BabylonRuntimeAdapter construction", () => {
  it("starts with no session and the all-false capabilities", () => {
    const { adapter } = createSubject();

    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);
    expect(adapter.session.getState()).toBe("none");
    expect(adapter.getSession()).toBeNull();
  });

  it("adopts a session the experience is already presenting", () => {
    const { adapter } = createSubject({
      initialSession: { enabledFeatures: ["hand-tracking"], environmentBlendMode: "additive" }
    });

    expect(adapter.session.getState()).toBe("active");
    expect(adapter.getCapabilities()).toEqual({
      immersive: true,
      handTracking: true,
      planeDetection: false,
      passthrough: true,
      environmentBlendMode: "additive"
    });
    expect(adapter.getSession()).not.toBeNull();
  });

  it("constructs with no options at all, for a build with no XR", async () => {
    const adapter = new BabylonRuntimeAdapter();

    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);
    expect(adapter.getSession()).toBeNull();
    expect(await adapter.session.request("immersive-vr")).toEqual({
      ok: false,
      reason: "unsupported"
    });
  });

  it("subscribes to nothing when the experience carries no observables", async () => {
    const { adapter, host } = createSubject({ withObservables: false });

    expect(host.observerCount()).toBe(0);

    const pending = adapter.session.request("immersive-vr");
    host.startSession({ enabledFeatures: ["plane-detection"] });

    expect(await pending).toEqual({ ok: true });
    expect(adapter.session.getState()).toBe("active");
    expect(adapter.getCapabilities().planeDetection).toBe(true);
    expect(adapter.getSession()).toBe(host.session());
  });
});

describe("BabylonRuntimeAdapter session requests", () => {
  it("reports unsupported when the page has no XR experience", async () => {
    const adapter = new BabylonRuntimeAdapter({ xr: null });

    expect(await adapter.session.request("immersive-vr")).toEqual({
      ok: false,
      reason: "unsupported"
    });
    expect(adapter.session.getState()).toBe("none");
  });

  it("reports unsupported when the mode is not supported", async () => {
    const { adapter, host } = createSubject();
    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));
    host.setSupported(false);

    expect(await adapter.session.request("immersive-ar")).toEqual({
      ok: false,
      reason: "unsupported"
    });
    expect(states).toEqual(["requesting", "none"]);
    expect(host.enters).toHaveLength(0);
  });

  it("reports denied when the user or the prompt refuses", async () => {
    const { adapter, host } = createSubject();
    const error = Object.assign(new Error("refused"), { name: "NotAllowedError" });
    host.failEnter(error);

    expect(await adapter.session.request("immersive-vr")).toEqual({
      ok: false,
      reason: "denied",
      error
    });
  });

  it("reports denied when the permissions policy blocks the support check", async () => {
    const { adapter, host } = createSubject();
    const error = Object.assign(new Error("blocked"), { name: "SecurityError" });
    host.failSupportCheck(error);

    expect(await adapter.session.request("immersive-vr")).toEqual({
      ok: false,
      reason: "denied",
      error
    });
  });

  it("reports error for any other failure, with the error attached", async () => {
    const { adapter, host } = createSubject();
    const error = new Error("device is busy");
    host.failEnter(error);

    expect(await adapter.session.request("immersive-vr")).toEqual({
      ok: false,
      reason: "error",
      error
    });
    expect(adapter.session.getState()).toBe("none");
  });

  it("reports error when the rejection carries no name at all", async () => {
    const { adapter, host } = createSubject();
    host.failEnter(null);

    expect(await adapter.session.request("immersive-vr")).toEqual({
      ok: false,
      reason: "error",
      error: null
    });
  });

  it("reports timeout when the experience never enters XR", async () => {
    vi.useFakeTimers();
    const { adapter } = createSubject();

    const pending = adapter.session.request("immersive-vr", { timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);

    expect(await pending).toEqual({ ok: false, reason: "timeout" });
    expect(adapter.session.getState()).toBe("none");
  });

  it("waits the default timeout when none is given", async () => {
    vi.useFakeTimers();
    const { adapter } = createSubject();

    const pending = adapter.session.request("immersive-vr");
    await vi.advanceTimersByTimeAsync(DEFAULT_SESSION_TIMEOUT_MS - 1);
    expect(adapter.session.getState()).toBe("requesting");

    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual({ ok: false, reason: "timeout" });
  });

  it("resolves ok without asking the host when a session is already active", async () => {
    const { adapter, host } = createSubject();

    const pending = adapter.session.request("immersive-vr");
    host.startSession();
    await pending;

    expect(await adapter.session.request("immersive-vr")).toEqual({ ok: true });
    expect(host.enters).toHaveLength(1);
  });

  it("enters local-floor by default and sends no session init", async () => {
    const { adapter, host } = createSubject();

    const pending = adapter.session.request("inline");
    host.startSession();
    await pending;

    expect(host.enters).toEqual([
      { mode: "inline", referenceSpaceType: "local-floor", renderTarget: undefined, init: undefined }
    ]);
  });

  it("passes the configured reference space and the init the hook returns", async () => {
    const host = createFakeBabylonXR();
    const adapter = new BabylonRuntimeAdapter({
      xr: host.experience,
      referenceSpaceType: "unbounded",
      sessionInit: (mode) => ({ optionalFeatures: ["hand-tracking"], mode })
    });

    const pending = adapter.session.request("immersive-ar");
    host.startSession();
    await pending;

    expect(host.enters).toEqual([
      {
        mode: "immersive-ar",
        referenceSpaceType: "unbounded",
        renderTarget: undefined,
        init: { optionalFeatures: ["hand-tracking"], mode: "immersive-ar" }
      }
    ]);
  });

  it("merges the request's features over the hook's, rather than replacing them", async () => {
    const host = createFakeBabylonXR();
    const adapter = new BabylonRuntimeAdapter({
      xr: host.experience,
      sessionInit: () => ({ optionalFeatures: ["hand-tracking"] })
    });

    const pending = adapter.session.request("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["hand-tracking", "layers"]
    });
    host.startSession();
    await pending;

    expect(host.enters).toEqual([
      {
        mode: "immersive-ar",
        referenceSpaceType: "local-floor",
        renderTarget: undefined,
        init: {
          optionalFeatures: ["hand-tracking", "layers"],
          requiredFeatures: ["hit-test"]
        }
      }
    ]);
  });

  it("builds a session init from the request alone where the app configured none", async () => {
    const { adapter, host } = createSubject();

    const pending = adapter.session.request("immersive-vr", { requiredFeatures: ["anchors"] });
    host.startSession();
    await pending;

    expect(host.enters).toEqual([
      {
        mode: "immersive-vr",
        referenceSpaceType: "local-floor",
        renderTarget: undefined,
        init: { requiredFeatures: ["anchors"] }
      }
    ]);
  });

  it("goes ahead when the session manager cannot answer the support check", async () => {
    const { adapter, host } = createSubject({ withSupportCheck: false });

    const pending = adapter.session.request("immersive-vr");
    host.startSession();

    expect(await pending).toEqual({ ok: true });
    expect(host.counters.supportChecks).toBe(0);
    expect(host.enters).toHaveLength(1);
  });

  it("goes active over an experience that carries no session manager", async () => {
    const { adapter, host } = createSubject({ withSessionManager: false });

    const pending = adapter.session.request("immersive-vr");
    host.startSession();

    expect(await pending).toEqual({ ok: true });
    expect(adapter.session.getState()).toBe("active");
    // Nothing to read the session off, so capabilities stay at the defaults.
    expect(adapter.getSession()).toBeNull();
    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);

    await adapter.session.end();

    expect(adapter.session.getState()).toBe("none");
    expect(host.counters.exits).toBe(1);
  });
});

describe("BabylonRuntimeAdapter session end", () => {
  it("resolves immediately when there is no session", async () => {
    const { adapter, host } = createSubject();

    await adapter.session.end();

    expect(adapter.session.getState()).toBe("none");
    expect(host.counters.exits).toBe(0);
  });

  it("resolves immediately when there is no XR experience", async () => {
    const adapter = new BabylonRuntimeAdapter({ xr: null });

    await adapter.session.end();

    expect(adapter.session.getState()).toBe("none");
  });

  it("walks ending then none, and drops the capabilities", async () => {
    const { adapter, host } = createSubject();
    const states: SessionState[] = [];

    const pending = adapter.session.request("immersive-vr");
    host.startSession({ enabledFeatures: ["hand-tracking"] });
    await pending;
    adapter.session.onStateChange((state) => states.push(state));

    await adapter.session.end();

    expect(states).toEqual(["ending", "none"]);
    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);
    expect(adapter.getSession()).toBeNull();
    expect(host.counters.exits).toBe(1);
  });

  it("settles when the experience raises no end signal at all", async () => {
    const { adapter, host } = createSubject({
      dispatchesStateChanges: false,
      dispatchesSessionEvents: false,
      dispatchesSessionEnd: false,
      clearsSessionOnEnd: false
    });

    const pending = adapter.session.request("immersive-vr");
    host.startSession();
    await pending;

    await adapter.session.end();

    expect(adapter.session.getState()).toBe("none");
    expect(host.counters.exits).toBe(1);
  });

  it("settles when the experience rejects the exit call", async () => {
    const { adapter, host } = createSubject();

    const pending = adapter.session.request("immersive-vr");
    host.startSession();
    await pending;
    host.failExit(new Error("stuck"));

    await adapter.session.end();

    expect(adapter.session.getState()).toBe("none");
  });

  it("follows a session that ends from the host side", async () => {
    const { adapter, host } = createSubject();
    const visibilities: SessionVisibility[] = [];

    const pending = adapter.session.request("immersive-vr");
    host.startSession();
    await pending;
    adapter.session.onVisibilityChange((visibility) => visibilities.push(visibility));

    host.endSession();

    expect(adapter.session.getState()).toBe("none");
    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);
    expect(visibilities).toEqual(["non-immersive"]);
  });
});

describe("BabylonRuntimeAdapter external state changes", () => {
  it("follows an XR session started outside the adapter", () => {
    const { adapter, host } = createSubject({ dispatchesSessionEvents: false });
    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    host.enterExternally({ environmentBlendMode: "alpha-blend" });

    expect(states).toEqual(["requesting", "active"]);
    expect(adapter.session.getState()).toBe("active");
    expect(adapter.getCapabilities().passthrough).toBe(true);
  });

  it("returns to none when the helper exits XR outside the adapter", () => {
    const { adapter, host } = createSubject({ dispatchesSessionEvents: false });
    host.enterExternally();

    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    host.dispatchState(BABYLON_WEBXR_STATE.EXITING_XR);
    host.clearSession();
    host.dispatchState(BABYLON_WEBXR_STATE.NOT_IN_XR);

    expect(states).toEqual(["ending", "none"]);
    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);
  });

  it("ignores an IN_XR state with no session behind it", () => {
    const { adapter, host } = createSubject();
    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    host.dispatchState(BABYLON_WEBXR_STATE.IN_XR);

    expect(states).toEqual([]);
    expect(adapter.session.getState()).toBe("none");
  });

  it("ignores a state value it does not recognise", () => {
    const { adapter, host } = createSubject();
    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    host.dispatchState(99);

    expect(states).toEqual([]);
  });

  it("ignores a NOT_IN_XR state when there was no session to begin with", () => {
    const { adapter, host } = createSubject();
    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    host.dispatchState(BABYLON_WEBXR_STATE.NOT_IN_XR);

    expect(states).toEqual([]);
    expect(adapter.session.getState()).toBe("none");
  });
});

describe("BabylonRuntimeAdapter visibility", () => {
  it("reports the session visibility, and non-immersive with no session", async () => {
    const { adapter, host } = createSubject();
    const visibilities: SessionVisibility[] = [];
    adapter.session.onVisibilityChange((visibility) => visibilities.push(visibility));

    const pending = adapter.session.request("immersive-vr");
    const session = host.startSession();
    await pending;

    session.setVisibility("visible-blurred");
    session.setVisibility("hidden");
    await adapter.session.end();

    expect(visibilities).toEqual(["visible", "visible-blurred", "hidden", "non-immersive"]);
  });

  it("reports an unrecognised visibility as hidden", async () => {
    const { adapter, host } = createSubject();

    const pending = adapter.session.request("immersive-vr");
    const session = host.startSession();
    await pending;

    const visibilities: SessionVisibility[] = [];
    adapter.session.onVisibilityChange((visibility) => visibilities.push(visibility));

    session.setVisibility("dozing");
    session.setVisibility(42);

    expect(visibilities).toEqual(["hidden", "hidden"]);
  });

  it("stops delivering once the subscriber unsubscribes", async () => {
    const { adapter, host } = createSubject();
    const visibilities: SessionVisibility[] = [];
    const unsubscribe = adapter.session.onVisibilityChange((v) => visibilities.push(v));

    const pending = adapter.session.request("immersive-vr");
    const session = host.startSession();
    await pending;
    unsubscribe();
    session.setVisibility("hidden");

    expect(visibilities).toEqual(["visible"]);
  });
});

describe("BabylonRuntimeAdapter capabilities", () => {
  it("re-derives when the session's input sources change", async () => {
    const { adapter, host } = createSubject();
    const seen: AdapterCapabilities[] = [];

    const pending = adapter.session.request("immersive-vr");
    const session = host.startSession();
    await pending;
    adapter.onCapabilitiesChange((capabilities) => seen.push(capabilities));

    session.setInputSources([{ hand: {} }]);

    expect(adapter.getCapabilities().handTracking).toBe(true);
    expect(seen).toHaveLength(1);
  });

  it("keeps an override over every later derivation until it is cleared", async () => {
    const { adapter, host } = createSubject();
    adapter.setCapabilities({ passthrough: true });

    expect(adapter.getCapabilities().passthrough).toBe(true);

    const pending = adapter.session.request("immersive-vr");
    host.startSession({ environmentBlendMode: "opaque" });
    await pending;

    expect(adapter.getCapabilities().passthrough).toBe(true);

    adapter.clearCapabilityOverrides();

    expect(adapter.getCapabilities().passthrough).toBe(false);
  });

  it("notifies only when a flag actually changes", () => {
    const { adapter } = createSubject();
    let calls = 0;
    adapter.onCapabilitiesChange(() => calls++);

    adapter.setCapabilities({ immersive: false });
    adapter.clearCapabilityOverrides();

    expect(calls).toBe(0);
  });

  it("adopts a session the host presents without any signal", () => {
    const { adapter, host } = createSubject();
    host.presentSession({ enabledFeatures: ["plane-detection"] });

    adapter.refreshCapabilities();

    expect(adapter.getCapabilities().planeDetection).toBe(true);
    expect(adapter.getSession()).toBe(host.session());
  });

  it("drops a session the host removed without any signal", async () => {
    const { adapter, host } = createSubject({
      dispatchesStateChanges: false,
      dispatchesSessionEvents: false,
      dispatchesSessionEnd: false
    });

    const pending = adapter.session.request("immersive-vr");
    host.startSession();
    await pending;
    host.clearSession();

    adapter.refreshCapabilities();

    expect(adapter.session.getState()).toBe("none");
    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);
  });

  it("is a no-op when there was no session to begin with", () => {
    const { adapter } = createSubject();
    let calls = 0;
    adapter.onCapabilitiesChange(() => calls++);

    adapter.refreshCapabilities();

    expect(calls).toBe(0);
    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);
  });
});

describe("BabylonRuntimeAdapter frames", () => {
  it("owns the render loop when given a host", () => {
    const now = vi.spyOn(performance, "now");
    const engine = createFakeEngineHost();
    const host = createFakeBabylonXR();
    const scheduler = new ManualScheduler();
    const adapter = new BabylonRuntimeAdapter({ xr: host.experience, host: engine, scheduler });

    const frames: FrameInfo[] = [];
    const ticks: string[] = [];
    adapter.onFrame((frame) => frames.push(frame));
    scheduler.subscribe("renderTick", (context) => {
      ticks.push(`${context.source}:${context.frame}:${context.deltaTime}`);
    });

    adapter.start();
    adapter.start();
    now.mockReturnValue(1000);
    engine.frame();
    now.mockReturnValue(1040);
    engine.frame();

    expect(frames).toEqual([
      { timestamp: 1000, delta: 0.016 },
      { timestamp: 1040, delta: 0.04 }
    ]);
    expect(ticks).toEqual(["babylon:1:16", "babylon:2:40"]);
    expect(engine.runCalls()).toBe(1);

    adapter.stop();
    adapter.stop();

    expect(engine.callback()).toBeNull();
    expect(engine.stopCalls()).toBe(1);
  });

  it("emits frames with no scheduler wired", () => {
    vi.spyOn(performance, "now").mockReturnValue(500);
    const engine = createFakeEngineHost();
    const host = createFakeBabylonXR();
    const adapter = new BabylonRuntimeAdapter({ xr: host.experience, host: engine });

    const frames: FrameInfo[] = [];
    adapter.onFrame((frame) => frames.push(frame));

    adapter.start();
    engine.frame();

    expect(frames).toEqual([{ timestamp: 500, delta: 0.016 }]);
  });

  it("leaves the loop to the app when given no host", () => {
    const { adapter } = createSubject();
    const frames: FrameInfo[] = [];
    const unsubscribe = adapter.onFrame((frame) => frames.push(frame));

    adapter.start();
    adapter.emitFrame(8, 0.5);
    unsubscribe();
    adapter.emitFrame(9, 0.5);
    adapter.stop();

    expect(frames).toEqual([{ timestamp: 8, delta: 0.5 }]);
  });
});

describe("BabylonRuntimeAdapter dispose", () => {
  it("releases the loop, the observers and every subscriber", async () => {
    const engine = createFakeEngineHost();
    const host = createFakeBabylonXR();
    const adapter = new BabylonRuntimeAdapter({ xr: host.experience, host: engine });

    let frames = 0;
    adapter.onFrame(() => frames++);
    adapter.start();

    const pending = adapter.session.request("immersive-vr");
    const session = host.startSession();
    await pending;

    expect(session.listenerCount()).toBe(3);
    expect(host.observerCount()).toBe(3);

    adapter.dispose();

    expect(engine.callback()).toBeNull();
    expect(host.observerCount()).toBe(0);
    expect(session.listenerCount()).toBe(0);
    expect(adapter.getSession()).toBeNull();

    adapter.emitFrame(1, 0.1);

    expect(frames).toBe(0);
  });
});
