/**
 * XR Blocks has no Service Framework adapter of its own, but XR Blocks (`xrblocks`) runs on
 * three.js, so `service-framework-three` should serve it exactly as it serves
 * a plain three.js app. This proves that with the same conformance suites
 * every other adapter runs, wired the way an XR Blocks app actually reaches
 * three.js.
 *
 * Modelled structurally on XR Blocks 0.21.1
 * (`xrblocks/build/xrblocks.d.ts`, read from the WebXR-Environment repository's
 * `node_modules`; this package adds no dependency on `xrblocks`):
 *
 * - `Core.renderer` is the `THREE.WebGLRenderer` (`xb.core.renderer`), and its
 *   `.xr` is the `WebXRManager` this adapter is built to read - exactly the
 *   `WebXRManagerLike` shape `WebXRRuntimeAdapterOptions.xr` already expects.
 * - `Core.init()` starts XR Blocks' OWN render loop over that renderer - it is
 *   XR Blocks, not this adapter, that calls `renderer.setAnimationLoop`. Only
 *   one callback can be bound at a time, so the adapter must never be given
 *   `host: renderer` in an XR Blocks app: doing so would fight XR Blocks for
 *   the loop and silently stop every XR Blocks system (input, world, scripts)
 *   from ticking. `xb.core.renderer` below throws if `setAnimationLoop` is
 *   called on it at all, which is what would happen if a future change wired
 *   `host` here by mistake.
 * - XR Blocks' own extension point for per-frame logic is `Script`, whose
 *   `update(time, frame?)` the scripts manager calls once per animation frame
 *   (`Script` at `xrblocks.d.ts:3780`, `update` at `xrblocks.d.ts:3801`). An
 *   XR Blocks integration registers one script whose `update(time)` calls
 *   {@link WebXRRuntimeAdapter.tick}, the SAME frame step - the visibility
 *   gate, the focus/pause signals, the one frame count, `emitFrame` and
 *   `renderTick` - that `start()` binds to the owned loop on every other
 *   three.js app. XR Blocks does not get a second, reimplemented gate; it
 *   drives the one the adapter already has, by hand, because XR Blocks (not
 *   the adapter) owns the loop that calls it.
 *
 * Nothing here suggests a gap: the seam that serves a plain three.js app
 * serves XR Blocks unchanged, including the focus gate, because XR Blocks
 * never made the renderer, its WebXR manager or its session anything other
 * than the three.js and WebXR primitives the adapter already reads.
 */
import { describe, expect, it } from "vitest";
import { ManualScheduler } from "@realitycollective/service-framework";
import { runtimeAdapterContract } from "../../service-framework/test/helpers/runtime-adapter-contract.js";
import { renderTickContract } from "../../service-framework/test/helpers/render-tick-contract.js";
import { WebXRRuntimeAdapter } from "../src/index.js";
import { createFakeXRHost, type FakeXRHost } from "./helpers/fake-webxr.js";

/**
 * Stands in for `xb.core.renderer`: carries `.xr`, exactly as
 * `WebXRManagerLike`, plus the `setAnimationLoop` XR Blocks' own `Core.init()`
 * already calls for its render loop. It throws if anything here calls it too,
 * since that is the one thing an XR Blocks integration must not do.
 */
function createFakeXRBlocksRenderer(xrHost: FakeXRHost) {
  return {
    xr: xrHost.manager,
    setAnimationLoop(): void {
      throw new Error(
        "XR Blocks' Core owns setAnimationLoop; a service integration must drive frames through a Script instead."
      );
    }
  };
}

/**
 * Stands in for the one `Script` an XR Blocks app registers to bridge the
 * frame loop: its `update(time)` is called once per animation frame, the way
 * XR Blocks' scripts manager calls a registered `Script`'s `update`. It does
 * nothing but forward to {@link WebXRRuntimeAdapter.tick} - the point of
 * `tick()` is that a hand-driven caller needs no bookkeeping of its own.
 */
class FakeServiceBridgeScript {
  public constructor(private readonly adapter: WebXRRuntimeAdapter) {}

  public update(time: number): void {
    this.adapter.tick(time);
  }
}

function sink() {
  const calls: string[] = [];
  return {
    calls,
    manager: {
      emitFocusChange: (focused: boolean) => calls.push(`focus:${focused}`),
      emitPauseChange: ({ paused }: { readonly paused: boolean }) => calls.push(`pause:${paused}`)
    }
  };
}

runtimeAdapterContract("WebXRRuntimeAdapter (wired the way an XR Blocks app reaches it)", () => {
  const xrHost = createFakeXRHost();
  const renderer = createFakeXRBlocksRenderer(xrHost);
  // No `host`: XR Blocks' Core, not the adapter, owns the render loop.
  const adapter = new WebXRRuntimeAdapter({ xr: renderer.xr, xrSystem: xrHost.system });

  return {
    adapter,
    drive: {
      frame: (timestamp, delta) => adapter.emitFrame(timestamp, delta),
      capabilities: (partial) => adapter.setCapabilities(partial),
      sessionStart: () => xrHost.startSession(),
      sessionEnd: () => xrHost.endSession()
    }
  };
});

renderTickContract("WebXRRuntimeAdapter (wired the way an XR Blocks app reaches it)", () => {
  const scheduler = new ManualScheduler();
  const xrHost = createFakeXRHost();
  const renderer = createFakeXRBlocksRenderer(xrHost);
  const adapter = new WebXRRuntimeAdapter({ xr: renderer.xr, xrSystem: xrHost.system, scheduler });
  const bridge = new FakeServiceBridgeScript(adapter);

  return { scheduler, drive: { frame: (timestampMs) => bridge.update(timestampMs) } };
});

describe("the loop conflict a `host` option would cause", () => {
  it("proves passing XR Blocks' renderer as `host` would fight Core for the loop", () => {
    const xrHost = createFakeXRHost();
    const renderer = createFakeXRBlocksRenderer(xrHost);

    // The wiring above never does this; this is the defect it avoids. Passing
    // the same renderer as `host` calls `renderer.setAnimationLoop`, which XR
    // Blocks' own `Core.init()` already owns.
    expect(() => new WebXRRuntimeAdapter({ xr: renderer.xr, xrSystem: xrHost.system, host: renderer }).start()).toThrow(
      "XR Blocks' Core owns setAnimationLoop"
    );
  });
});

describe("the focus gate via XR Blocks' Script.update: the same gate, driven by hand", () => {
  it("never gates a desktop XR Blocks app with no session at all", () => {
    const xrHost = createFakeXRHost();
    const renderer = createFakeXRBlocksRenderer(xrHost);
    const { calls, manager } = sink();
    const adapter = new WebXRRuntimeAdapter({ xr: renderer.xr, xrSystem: xrHost.system, manager });
    const bridge = new FakeServiceBridgeScript(adapter);

    const frames: number[] = [];
    adapter.onFrame((frame) => frames.push(frame.timestamp));

    bridge.update(16);
    bridge.update(32);

    expect(frames).toEqual([16, 32]);
    expect(calls).toEqual([]);
  });

  it("passes no frame and no renderTick while a live session is hidden, and emits focus/pause", async () => {
    const xrHost = createFakeXRHost();
    const renderer = createFakeXRBlocksRenderer(xrHost);
    const { calls, manager } = sink();
    const scheduler = new ManualScheduler();
    const adapter = new WebXRRuntimeAdapter({ xr: renderer.xr, xrSystem: xrHost.system, scheduler, manager });
    const bridge = new FakeServiceBridgeScript(adapter);

    const frames: number[] = [];
    const ticks: number[] = [];
    adapter.onFrame((frame) => frames.push(frame.timestamp));
    scheduler.subscribe("renderTick", (context) => ticks.push(context.frame ?? -1));

    const pending = adapter.session.request("immersive-vr");
    xrHost.startSession({ visibilityState: "visible" });
    await pending;

    bridge.update(16);
    xrHost.session()?.setVisibility("hidden");
    bridge.update(32);
    xrHost.session()?.setVisibility("visible");
    bridge.update(48);

    expect(frames).toEqual([16, 48]);
    // The count does not advance on the gated frame: 1, then 2, skipping one.
    expect(ticks).toEqual([1, 2]);
    expect(calls).toEqual(["focus:true", "pause:false", "focus:false", "pause:true", "focus:true", "pause:false"]);
  });

  it("would keep ticking a hidden session if a script called emitFrame directly instead of tick()", async () => {
    // The defect tick() exists to prevent: emitFrame() alone carries no gate.
    // A Script.update that forwarded to emitFrame instead of tick() would tick
    // XR Blocks while the headset is off the face, exactly what the focus gate prevents.
    const xrHost = createFakeXRHost();
    const renderer = createFakeXRBlocksRenderer(xrHost);
    const adapter = new WebXRRuntimeAdapter({ xr: renderer.xr, xrSystem: xrHost.system });

    const frames: number[] = [];
    adapter.onFrame((frame) => frames.push(frame.timestamp));

    const pending = adapter.session.request("immersive-vr");
    xrHost.startSession({ visibilityState: "hidden" });
    await pending;

    adapter.emitFrame(16, 0.016);

    expect(frames).toEqual([16]);
  });
});
