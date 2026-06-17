import { describe, it, expect, beforeEach } from "vitest";
import { ServiceManager } from "@realitycollective/service-framework";
import {
  IWSDKAdapter,
  makeServiceBridgeSystem,
  type CreateSystemLike,
  type FrameInfo,
  type IWSDKSystemLike,
} from "../src/index.js";

const VISIBLE = "visible";
const HIDDEN = "hidden";

// Structural mock of @iwsdk/core's createSystem — returns a base system class
// with the update() entry point IWSDK invokes each frame.
const createSystem: CreateSystemLike = () =>
  class {
    public update(_delta: number, _time: number): void {}
  };

interface Harness {
  readonly system: IWSDKSystemLike;
  readonly world: { visibilityState: { value: string } };
  readonly frames: FrameInfo[];
  readonly focus: boolean[];
  readonly pause: boolean[];
}

function makeHarness(initial: string = HIDDEN): Harness {
  const world = { visibilityState: { value: initial } };
  const manager = new ServiceManager();
  const adapter = new IWSDKAdapter(world);

  const frames: FrameInfo[] = [];
  const focus: boolean[] = [];
  const pause: boolean[] = [];

  adapter.onFrame((frame) => frames.push(frame));
  manager.scheduler.subscribe("focusChange", (context) => focus.push(context.focused));
  manager.scheduler.subscribe("pauseChange", (context) => pause.push(context.paused));

  const ServiceBridgeSystem = makeServiceBridgeSystem({
    adapter,
    manager,
    world,
    createSystem,
    visibleState: VISIBLE,
  });

  return { system: new ServiceBridgeSystem(), world, frames, focus, pause };
}

describe("makeServiceBridgeSystem", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makeHarness(VISIBLE);
  });

  it("emits a focus(true)/pause(false) transition on the first visible frame", () => {
    harness.system.update(0.016, 1000);
    expect(harness.focus).toEqual([true]);
    expect(harness.pause).toEqual([false]);
  });

  it("pumps the adapter only while the session is visible/focused", () => {
    harness.system.update(0.016, 1000);
    expect(harness.frames).toHaveLength(1);
  });

  it("maps update(delta, time) to a frame of { timestamp: time, delta }", () => {
    harness.system.update(0.016, 1000);
    expect(harness.frames[0]).toEqual({ timestamp: 1000, delta: 0.016 });
  });

  it("does not re-emit focus/pause while focus is unchanged across frames", () => {
    harness.system.update(0.016, 1000);
    harness.system.update(0.016, 1016);
    harness.system.update(0.016, 1032);

    expect(harness.focus).toEqual([true]); // one transition only
    expect(harness.pause).toEqual([false]);
    expect(harness.frames).toHaveLength(3); // but every frame is pumped
  });

  it("auto-pauses and stops pumping when visibility is lost", () => {
    harness.system.update(0.016, 1000); // visible
    harness.world.visibilityState.value = HIDDEN;
    harness.system.update(0.016, 1016); // headset removed

    expect(harness.focus).toEqual([true, false]);
    expect(harness.pause).toEqual([false, true]);
    expect(harness.frames).toHaveLength(1); // no frame pumped while hidden
  });

  it("resumes pumping when visibility returns", () => {
    harness.system.update(0.016, 1000); // visible
    harness.world.visibilityState.value = HIDDEN;
    harness.system.update(0.016, 1016); // hidden
    harness.world.visibilityState.value = VISIBLE;
    harness.system.update(0.016, 1032); // visible again

    expect(harness.focus).toEqual([true, false, true]);
    expect(harness.pause).toEqual([false, true, false]);
    expect(harness.frames).toHaveLength(2);
  });

  it("stays idle (no frames, paused) when the session starts hidden", () => {
    const hidden = makeHarness(HIDDEN);
    hidden.system.update(0.016, 1000);

    expect(hidden.focus).toEqual([false]);
    expect(hidden.pause).toEqual([true]);
    expect(hidden.frames).toHaveLength(0);
  });
});
