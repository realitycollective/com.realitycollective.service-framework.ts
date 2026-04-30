import { ManualScheduler } from "@realitycollective/service-framework";
import { ThreeRenderLoopBridge } from "../src/index.js";

describe("three bindings", () => {
  it("binds and unbinds an animation loop host", () => {
    const scheduler = new ManualScheduler();
    let callback: ((timestamp: number) => void) | null = null;
    const emitted: string[] = [];
    const bridge = new ThreeRenderLoopBridge({
      scheduler,
      host: {
        setAnimationLoop(nextCallback) {
          callback = nextCallback;
        }
      }
    });

    scheduler.subscribe("renderTick", (context) => {
      emitted.push(`${context.source}:${context.frame}:${context.deltaTime}`);
    });

    bridge.start();
    const currentCallback = callback as ((timestamp: number) => void) | null;
    if (currentCallback) {
      currentCallback(16);
      currentCallback(32);
    }
    bridge.start();
    bridge.stop();
    bridge.stop();
    bridge.dispose();

    expect(emitted).toEqual(["three:1:16", "three:2:16"]);
    expect(callback).toBeNull();
  });
});
