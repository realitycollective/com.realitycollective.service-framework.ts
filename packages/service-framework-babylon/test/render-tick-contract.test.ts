/**
 * Both Babylon.js paths that emit `renderTick` run the shared suite. Babylon
 * hands a frame no timestamp, so the bindings read `performance.now()`; the
 * driver sets that clock.
 */
import { afterEach, vi } from "vitest";
import { ManualScheduler } from "@realitycollective/service-framework";
import { BabylonRenderLoopBridge, BabylonRuntimeAdapter } from "../src/index.js";
import { renderTickContract } from "../../service-framework/test/helpers/render-tick-contract.js";
import { createFakeBabylonXR, createFakeEngineHost } from "./helpers/fake-babylon-xr.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function clockedFrame(frame: () => void): (timestampMs: number) => void {
  const now = vi.spyOn(performance, "now");
  return (timestampMs) => {
    now.mockReturnValue(timestampMs);
    frame();
  };
}

renderTickContract("BabylonRenderLoopBridge", () => {
  const scheduler = new ManualScheduler();
  const engine = createFakeEngineHost();
  new BabylonRenderLoopBridge({ scheduler, host: engine }).start();
  return { scheduler, drive: { frame: clockedFrame(() => engine.frame()) } };
});

renderTickContract("BabylonRuntimeAdapter", () => {
  const scheduler = new ManualScheduler();
  const engine = createFakeEngineHost();
  const xr = createFakeBabylonXR();
  new BabylonRuntimeAdapter({ xr: xr.experience, host: engine, scheduler }).start();
  return { scheduler, drive: { frame: clockedFrame(() => engine.frame()) } };
});
