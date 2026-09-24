import { ManualScheduler, type LifecycleContext, type SessionVisibility } from "@realitycollective/service-framework";
import { NativeRuntimeAdapter, createNativeHostIO, type NativeSessionInfo } from "../src/index.js";
import { NATIVE_HOST_GLOBAL, getNativeHost } from "../src/native-host.js";
import { deriveNativeCapabilities } from "../src/native-runtime-adapter.js";
import { createFakeNativeHost } from "./helpers/fake-native-host.js";

const session = (patch: Partial<NativeSessionInfo>): NativeSessionInfo => ({
  state: "focused",
  extensions: [],
  systemHandTracking: false,
  blendMode: "opaque",
  ...patch
});

describe("deriveNativeCapabilities", () => {
  it("reports nothing without a live session", () => {
    expect(deriveNativeCapabilities(session({ state: "ready", blendMode: "alpha-blend" }))).toEqual({
      immersive: false,
      handTracking: false,
      planeDetection: false,
      passthrough: false,
      environmentBlendMode: null
    });
  });

  it("needs both the hand tracking extension and system support", () => {
    const extension = ["XR_EXT_hand_tracking"];

    expect(deriveNativeCapabilities(session({ extensions: extension, systemHandTracking: true })).handTracking).toBe(true);
    expect(deriveNativeCapabilities(session({ extensions: extension, systemHandTracking: false })).handTracking).toBe(false);
    expect(deriveNativeCapabilities(session({ extensions: [], systemHandTracking: true })).handTracking).toBe(false);
  });

  it("reports passthrough for any live blend mode but opaque", () => {
    expect(deriveNativeCapabilities(session({ state: "visible", blendMode: "alpha-blend" }))).toMatchObject({
      immersive: true,
      passthrough: true,
      environmentBlendMode: "alpha-blend"
    });
    expect(deriveNativeCapabilities(session({ state: "synchronized", blendMode: "additive" })).passthrough).toBe(true);
    expect(deriveNativeCapabilities(session({ blendMode: "opaque" })).passthrough).toBe(false);
    expect(deriveNativeCapabilities(session({ blendMode: null })).passthrough).toBe(false);
  });
});

describe("NativeRuntimeAdapter", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[NATIVE_HOST_GLOBAL];
  });

  it("reads globalThis.__rcHost when no host is given", () => {
    const host = createFakeNativeHost({ info: { state: "focused", blendMode: "opaque" } });
    (globalThis as Record<string, unknown>)[NATIVE_HOST_GLOBAL] = host;

    const adapter = new NativeRuntimeAdapter();

    expect(adapter.session.getState()).toBe("active");
    expect(adapter.getCapabilities().immersive).toBe(true);
    expect(getNativeHost()).toBe(host);
  });

  it("names the missing global when the app installed no host", () => {
    expect(() => new NativeRuntimeAdapter()).toThrow("globalThis.__rcHost is not installed");
  });

  it("emits renderTick in milliseconds with source native when given a scheduler", () => {
    const host = createFakeNativeHost();
    const scheduler = new ManualScheduler();
    const ticks: LifecycleContext[] = [];
    scheduler.subscribe("renderTick", (context) => ticks.push(context));
    const adapter = new NativeRuntimeAdapter({ host, scheduler });
    const frames: number[] = [];
    adapter.onFrame((frame) => frames.push(frame.delta));

    host.pushFrame(1000, 1 / 72);
    host.pushFrame(1014, 0.014);

    expect(frames).toEqual([1 / 72, 0.014]);
    expect(ticks.map((tick) => [tick.timestamp, tick.frame, tick.source])).toEqual([
      [1000, 1, "native"],
      [1014, 2, "native"]
    ]);
    expect(ticks[1]?.deltaTime).toBeCloseTo(14);
  });

  it("delivers frames with no scheduler", () => {
    const host = createFakeNativeHost();
    const adapter = new NativeRuntimeAdapter({ host });
    let count = 0;
    adapter.onFrame(() => {
      count += 1;
    });

    host.pushFrame(0, 0.01);

    expect(count).toBe(1);
  });

  it("passes the request options to the host as JSON", async () => {
    const host = createFakeNativeHost();
    const adapter = new NativeRuntimeAdapter({ host });

    const result = await adapter.session.request("immersive-ar", { requiredFeatures: ["hand-tracking"] });

    expect(result).toEqual({ ok: true });
    expect(host.requests).toEqual([{ mode: "immersive-ar", optionsJson: '{"requiredFeatures":["hand-tracking"]}' }]);
    expect(adapter.getCapabilities().environmentBlendMode).toBe("alpha-blend");
  });

  it("sends an empty options object when none is given", async () => {
    const host = createFakeNativeHost();
    await new NativeRuntimeAdapter({ host }).session.request("immersive-vr");

    expect(host.requests[0]?.optionsJson).toBe("{}");
  });

  it("answers ok at once when a session is already active", async () => {
    const host = createFakeNativeHost({ info: { state: "focused" } });

    expect(await new NativeRuntimeAdapter({ host }).session.request("immersive-vr")).toEqual({ ok: true });
    expect(host.requests).toEqual([]);
  });

  it("refuses a request while another is in flight", async () => {
    const host = createFakeNativeHost({ answerRequests: false });
    const adapter = new NativeRuntimeAdapter({ host });
    void adapter.session.request("immersive-vr", { timeoutMs: 50 });

    const second = await adapter.session.request("immersive-vr");

    expect(second).toMatchObject({ ok: false, reason: "error" });
    expect(host.requests).toHaveLength(1);
  });

  it("stays requesting while the host passes through idle, and times out when no session comes", async () => {
    vi.useFakeTimers();
    try {
      const host = createFakeNativeHost({ answerRequests: false });
      const adapter = new NativeRuntimeAdapter({ host });
      const states: string[] = [];
      adapter.session.onStateChange((state) => states.push(state));

      const pending = adapter.session.request("immersive-vr", { timeoutMs: 500 });
      host.setSession({ state: "idle" });
      vi.advanceTimersByTime(500);

      expect(await pending).toEqual({ ok: false, reason: "timeout" });
      expect(states).toEqual(["requesting", "none"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the default timeout when the request names none", async () => {
    vi.useFakeTimers();
    try {
      const adapter = new NativeRuntimeAdapter({ host: createFakeNativeHost({ answerRequests: false }) });
      const pending = adapter.session.request("immersive-vr");
      vi.advanceTimersByTime(10_000);

      expect(await pending).toEqual({ ok: false, reason: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves end() at once without a session, and otherwise once the host reports none", async () => {
    const host = createFakeNativeHost({ info: { state: "focused" }, answerEnd: false });
    const adapter = new NativeRuntimeAdapter({ host });
    await new NativeRuntimeAdapter({ host: createFakeNativeHost() }).session.end();

    let ended = false;
    const ending = adapter.session.end().then(() => {
      ended = true;
    });
    host.setSession({ state: "stopping" });
    await Promise.resolve();

    expect(adapter.session.getState()).toBe("ending");
    expect(ended).toBe(false);

    host.setSession({ state: "none" });
    await ending;

    expect(host.endCalls).toBe(1);
    expect(adapter.session.getState()).toBe("none");
  });

  it("maps OpenXR states to visibility and reports each change once", () => {
    const host = createFakeNativeHost();
    const adapter = new NativeRuntimeAdapter({ host });
    const seen: SessionVisibility[] = [];
    const stop = adapter.session.onVisibilityChange((visibility) => seen.push(visibility));

    for (const state of ["synchronized", "visible", "focused", "focused", "none"] as const) {
      host.setSession({ state });
    }
    stop();
    host.setSession({ state: "focused" });

    expect(seen).toEqual(["hidden", "visible-blurred", "visible", "non-immersive"]);
  });

  it("keeps overrides over later derivations until cleared, and re-derives on demand", () => {
    const host = createFakeNativeHost({ info: { state: "focused" } });
    const adapter = new NativeRuntimeAdapter({ host });
    const calls: boolean[] = [];
    adapter.onCapabilitiesChange((capabilities) => calls.push(capabilities.planeDetection));

    adapter.setCapabilities({ planeDetection: true });
    adapter.setCapabilities({ planeDetection: true });
    host.setSession({ state: "visible" });

    expect(adapter.getCapabilities().planeDetection).toBe(true);

    adapter.clearCapabilityOverrides();
    expect(adapter.getCapabilities().planeDetection).toBe(false);
    expect(calls).toEqual([true, false]);

    // A host whose session info changed without telling the adapter.
    const quiet = createFakeNativeHost();
    const quietAdapter = new NativeRuntimeAdapter({ host: quiet });
    (quiet as { getSessionInfo: () => NativeSessionInfo }).getSessionInfo = () => session({});
    quietAdapter.refreshCapabilities();

    expect(quietAdapter.getCapabilities().immersive).toBe(true);
  });

  it("releases its host subscriptions, a pending request and end waiters on dispose", async () => {
    const host = createFakeNativeHost({ answerRequests: false, answerEnd: false });
    const adapter = new NativeRuntimeAdapter({ host });
    const request = adapter.session.request("immersive-vr");
    host.setSession({ state: "stopping" });
    const ending = adapter.session.end();
    let frames = 0;
    adapter.onFrame(() => {
      frames += 1;
    });

    adapter.dispose();
    host.pushFrame(0, 0.01);

    expect(await request).toMatchObject({ ok: false, reason: "error" });
    await expect(ending).resolves.toBeUndefined();
    expect(frames).toBe(0);
    expect(host.frameSubscribers()).toBe(0);
    expect(host.sessionSubscribers()).toBe(0);
  });

  it("disposes cleanly with nothing in flight", () => {
    const host = createFakeNativeHost();
    const adapter = new NativeRuntimeAdapter({ host });

    adapter.dispose();

    expect(host.frameSubscribers()).toBe(0);
  });
});

describe("createNativeHostIO", () => {
  it("forwards to the host's io slice", async () => {
    const host = createFakeNativeHost({
      io: {
        fetchBytes: async (url) => new Uint8Array([url.length]),
        gunzip: async (bytes) => new Uint8Array([...bytes, 0])
      }
    });
    const io = createNativeHostIO(host);

    expect([...(await io.fetchBytes("abc"))]).toEqual([3]);
    expect([...(await io.gunzip(new Uint8Array([7])))]).toEqual([7, 0]);
  });

  it("names the missing io slice", () => {
    expect(() => createNativeHostIO(createFakeNativeHost())).toThrow("The native host has no io slice.");
  });
});
