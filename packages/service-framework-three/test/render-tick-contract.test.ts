/**
 * Both three.js paths that emit `renderTick` - the render-loop bridge and the
 * WebXR runtime adapter that owns the loop - run the shared suite.
 */
import { ManualScheduler } from "@realitycollective/service-framework";
import { ThreeRenderLoopBridge, WebXRRuntimeAdapter } from "../src/index.js";
import { renderTickContract } from "../../service-framework/test/helpers/render-tick-contract.js";
import { createFakeAnimationLoopHost, createFakeXRHost } from "./helpers/fake-webxr.js";

renderTickContract("ThreeRenderLoopBridge", () => {
  const scheduler = new ManualScheduler();
  const loop = createFakeAnimationLoopHost();
  new ThreeRenderLoopBridge({ scheduler, host: loop }).start();
  return { scheduler, drive: { frame: (timestampMs) => loop.frame(timestampMs) } };
});

renderTickContract("WebXRRuntimeAdapter", () => {
  const scheduler = new ManualScheduler();
  const loop = createFakeAnimationLoopHost();
  const xrHost = createFakeXRHost();
  new WebXRRuntimeAdapter({ xr: xrHost.manager, xrSystem: xrHost.system, host: loop, scheduler }).start();
  return { scheduler, drive: { frame: (timestampMs) => loop.frame(timestampMs) } };
});
