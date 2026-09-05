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
import { WebXRRuntimeAdapter } from "../src/index.js";
import { createFakeAnimationLoopHost, createFakeXRHost } from "./helpers/fake-webxr.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The common wiring: a fake renderer manager and a fake `navigator.xr`. */
function createSubject(hostOptions: Parameters<typeof createFakeXRHost>[0] = {}) {
  const host = createFakeXRHost(hostOptions);
  const adapter = new WebXRRuntimeAdapter({ xr: host.manager, xrSystem: host.system });

  return { host, adapter };
}

describe("WebXRRuntimeAdapter construction", () => {
  it("starts with no session and the all-false capabilities", () => {
    const { adapter } = createSubject();

    expect(adapter.getCapabilities()).toEqual(DEFAULT_CAPABILITIES);
    expect(adapter.session.getState()).toBe("none");
    expect(adapter.getSession()).toBeNull();
  });

  it("adopts a session the renderer is already presenting", () => {
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
});

describe("WebXRRuntimeAdapter session requests", () => {
  it("reports unsupported when the page has no XR system", async () => {
    const host = createFakeXRHost();
    const adapter = new WebXRRuntimeAdapter({ xr: host.manager, xrSystem: null });

    expect(await adapter.session.request("immersive-vr")).toEqual({
      ok: false,
      reason: "unsupported"
    });
    expect(adapter.session.getState()).toBe("none");
    expect(host.counters.supportChecks).toBe(0);
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
    expect(host.requests).toHaveLength(0);
  });

  it("reports denied when the user or the prompt refuses", async () => {
    const { adapter, host } = createSubject();
    const error = Object.assign(new Error("refused"), { name: "NotAllowedError" });
    host.failRequest(error);

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
    host.failRequest(error);

    expect(await adapter.session.request("immersive-vr")).toEqual({
      ok: false,
      reason: "error",
      error
    });
  });

  it("reports error when the rejection carries no name at all", async () => {
    const { adapter, host } = createSubject();
    host.failRequest(null);

    expect(await adapter.session.request("immersive-vr")).toEqual({
      ok: false,
      reason: "error",
      error: null
    });
  });

  it("reports error when the renderer refuses the session", async () => {
    const { adapter, host } = createSubject();
    const error = new Error("no XR context");
    host.failSetSession(error);

    const pending = adapter.session.request("immersive-vr");
    host.startSession();

    expect(await pending).toEqual({ ok: false, reason: "error", error });
    expect(adapter.session.getState()).toBe("none");
  });

  it("reports timeout when the host never hands over a session", async () => {
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
    expect(host.requests).toHaveLength(1);
  });

  it("passes the session init the hook returns, per mode", async () => {
    const host = createFakeXRHost();
    const adapter = new WebXRRuntimeAdapter({
      xr: host.manager,
      xrSystem: host.system,
      sessionInit: (mode) => ({ optionalFeatures: ["hand-tracking"], mode })
    });

    const pending = adapter.session.request("immersive-ar");
    host.startSession();
    await pending;

    expect(host.requests).toEqual([
      { mode: "immersive-ar", init: { optionalFeatures: ["hand-tracking"], mode: "immersive-ar" } }
    ]);
  });

  it("sends no session init by default", async () => {
    const { adapter, host } = createSubject();

    const pending = adapter.session.request("inline");
    host.startSession();
    await pending;

    expect(host.requests).toEqual([{ mode: "inline", init: undefined }]);
  });

  it("merges the request's features over the hook's, rather than replacing them", async () => {
    const host = createFakeXRHost();
    const adapter = new WebXRRuntimeAdapter({
      xr: host.manager,
      xrSystem: host.system,
      sessionInit: () => ({ optionalFeatures: ["hand-tracking"] })
    });

    const pending = adapter.session.request("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["hand-tracking", "layers"]
    });
    host.startSession();
    await pending;

    expect(host.requests).toEqual([
      {
        mode: "immersive-ar",
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

    expect(host.requests).toEqual([
      { mode: "immersive-vr", init: { requiredFeatures: ["anchors"] } }
    ]);
  });

  it("goes active over a renderer that raises no events of its own", async () => {
    const { adapter, host } = createSubject({ dispatchesManagerEvents: false });

    const pending = adapter.session.request("immersive-vr");
    host.startSession({ enabledFeatures: ["plane-detection"] });

    expect(await pending).toEqual({ ok: true });
    expect(adapter.session.getState()).toBe("active");
    expect(adapter.getCapabilities().planeDetection).toBe(true);
    expect(adapter.getSession()).toBe(host.session());
  });
});

describe("WebXRRuntimeAdapter default XR system", () => {
  it("uses navigator.xr when no system is given", async () => {
    const host = createFakeXRHost();
    vi.stubGlobal("navigator", { xr: host.system });
    const adapter = new WebXRRuntimeAdapter({ xr: host.manager });

    const pending = adapter.session.request("immersive-vr");
    host.startSession();

    expect(await pending).toEqual({ ok: true });
  });

  it("reports unsupported where there is no navigator", async () => {
    const host = createFakeXRHost();
    vi.stubGlobal("navigator", undefined);
    const adapter = new WebXRRuntimeAdapter({ xr: host.manager });

    expect(await adapter.session.request("immersive-vr")).toEqual({
      ok: false,
      reason: "unsupported"
    });
  });

  it("reports unsupported where the browser has no WebXR", async () => {
    const host = createFakeXRHost();
    vi.stubGlobal("navigator", {});
    const adapter = new WebXRRuntimeAdapter({ xr: host.manager });

    expect(await adapter.session.request("immersive-vr")).toEqual({
      ok: false,
      reason: "unsupported"
    });
  });
});

describe("WebXRRuntimeAdapter session end", () => {
  it("resolves immediately when there is no session", async () => {
    const { adapter } = createSubject();

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
  });

  it("settles when the host raises no end event at all", async () => {
    const { adapter, host } = createSubject({
      dispatchesManagerEvents: false,
      dispatchesSessionEnd: false,
      clearsSessionOnEnd: false
    });

    const pending = adapter.session.request("immersive-vr");
    host.startSession();
    await pending;

    await adapter.session.end();

    expect(adapter.session.getState()).toBe("none");
    expect(host.session()?.endCalls()).toBe(1);
  });

  it("settles when the host rejects the end call", async () => {
    const { adapter, host } = createSubject();

    const pending = adapter.session.request("immersive-vr");
    host.startSession({ endRejects: new Error("stuck") });
    await pending;

    await adapter.session.end();

    expect(adapter.session.getState()).toBe("none");
  });

  it("follows a session that ends itself with no manager event", async () => {
    const { adapter, host } = createSubject({ dispatchesManagerEvents: false });
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

  it("ignores a manager session event with no session behind it", () => {
    const { adapter, host } = createSubject();
    const states: SessionState[] = [];
    adapter.session.onStateChange((state) => states.push(state));

    host.dispatchManagerEvent("sessionstart");
    host.dispatchManagerEvent("sessionend");

    expect(states).toEqual([]);
    expect(adapter.session.getState()).toBe("none");
  });
});

describe("WebXRRuntimeAdapter visibility", () => {
  it("reports the session visibility, and non-immersive with no session", async () => {
    const { adapter, host } = createSubject();
    const visibilities: SessionVisibility[] = [];
    adapter.session.onVisibilityChange((visibility) => visibilities.push(visibility));

    const pending = adapter.session.request("immersive-vr");
    host.startSession();
    await pending;

    const session = host.session();
    session?.setVisibility("visible-blurred");
    session?.setVisibility("hidden");
    await adapter.session.end();

    expect(visibilities).toEqual(["visible", "visible-blurred", "hidden", "non-immersive"]);
  });

  it("reports an unrecognised visibility as hidden", async () => {
    const { adapter, host } = createSubject();
    const visibilities: SessionVisibility[] = [];

    const pending = adapter.session.request("immersive-vr");
    host.startSession();
    await pending;
    adapter.session.onVisibilityChange((visibility) => visibilities.push(visibility));

    host.session()?.setVisibility("dozing");
    host.session()?.setVisibility(42);

    expect(visibilities).toEqual(["hidden", "hidden"]);
  });

  it("stops delivering once the subscriber unsubscribes", async () => {
    const { adapter, host } = createSubject();
    const visibilities: SessionVisibility[] = [];
    const unsubscribe = adapter.session.onVisibilityChange((v) => visibilities.push(v));

    const pending = adapter.session.request("immersive-vr");
    host.startSession();
    await pending;
    unsubscribe();
    host.session()?.setVisibility("hidden");

    expect(visibilities).toEqual(["visible"]);
  });
});

describe("WebXRRuntimeAdapter capabilities", () => {
  it("re-derives when the session's input sources change", async () => {
    const { adapter, host } = createSubject();
    const seen: AdapterCapabilities[] = [];

    const pending = adapter.session.request("immersive-vr");
    host.startSession();
    await pending;
    adapter.onCapabilitiesChange((capabilities) => seen.push(capabilities));

    host.session()?.setInputSources([{ hand: {} }]);

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

  it("adopts a session the host presents without any event", () => {
    const { adapter, host } = createSubject({ dispatchesManagerEvents: false });
    host.presentSession({ enabledFeatures: ["plane-detection"] });

    adapter.refreshCapabilities();

    expect(adapter.getCapabilities().planeDetection).toBe(true);
    expect(adapter.getSession()).toBe(host.session());
  });

  it("drops a session the host removed without any event", async () => {
    const { adapter, host } = createSubject({
      dispatchesManagerEvents: false,
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

describe("WebXRRuntimeAdapter frames", () => {
  it("owns the animation loop when given a host", () => {
    const loopHost = createFakeAnimationLoopHost();
    const xrHost = createFakeXRHost();
    const scheduler = new ManualScheduler();
    const adapter = new WebXRRuntimeAdapter({
      xr: xrHost.manager,
      xrSystem: xrHost.system,
      host: loopHost,
      scheduler
    });

    const frames: FrameInfo[] = [];
    const ticks: string[] = [];
    adapter.onFrame((frame) => frames.push(frame));
    scheduler.subscribe("renderTick", (context) => {
      ticks.push(`${context.source}:${context.frame}:${context.deltaTime}`);
    });

    adapter.start();
    adapter.start();
    loopHost.frame(16);
    loopHost.frame(32);

    expect(frames).toEqual([
      { timestamp: 16, delta: 0.016 },
      { timestamp: 32, delta: 0.016 }
    ]);
    expect(ticks).toEqual(["three:1:16", "three:2:16"]);
    expect(loopHost.calls()).toBe(1);

    adapter.stop();
    adapter.stop();

    expect(loopHost.callback()).toBeNull();
    expect(loopHost.calls()).toBe(2);
  });

  it("emits frames with no scheduler wired", () => {
    const loopHost = createFakeAnimationLoopHost();
    const xrHost = createFakeXRHost();
    const adapter = new WebXRRuntimeAdapter({
      xr: xrHost.manager,
      xrSystem: xrHost.system,
      host: loopHost
    });

    const frames: FrameInfo[] = [];
    adapter.onFrame((frame) => frames.push(frame));

    adapter.start();
    loopHost.frame(100);

    expect(frames).toEqual([{ timestamp: 100, delta: 0.016 }]);
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

describe("WebXRRuntimeAdapter dispose", () => {
  it("releases the loop, the host listeners and every subscriber", async () => {
    const loopHost = createFakeAnimationLoopHost();
    const xrHost = createFakeXRHost();
    const adapter = new WebXRRuntimeAdapter({
      xr: xrHost.manager,
      xrSystem: xrHost.system,
      host: loopHost
    });

    let frames = 0;
    adapter.onFrame(() => frames++);
    adapter.start();

    const pending = adapter.session.request("immersive-vr");
    xrHost.startSession();
    await pending;

    const session = xrHost.session();
    expect(session?.listenerCount()).toBe(3);

    adapter.dispose();

    expect(loopHost.callback()).toBeNull();
    expect(xrHost.managerListenerCount()).toBe(0);
    expect(session?.listenerCount()).toBe(0);
    expect(adapter.getSession()).toBeNull();

    adapter.emitFrame(1, 0.1);

    expect(frames).toBe(0);
  });
});
