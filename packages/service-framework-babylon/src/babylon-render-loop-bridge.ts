import type { IScheduler, LifecycleContext } from "@realitycollective/service-framework";

/**
 * Minimal contract that a Babylon.js Engine (or any compatible mock) must satisfy
 * for the bridge to operate. Using an interface rather than a concrete Engine reference
 * keeps the bridge tree-shakeable and trivially mockable in unit tests.
 */
export interface BabylonEngineHostLike {
  runRenderLoop(callback: () => void): void;
  stopRenderLoop(callback: () => void): void;
}

export interface BabylonRenderLoopBridgeOptions {
  readonly scheduler: IScheduler;
  readonly host: BabylonEngineHostLike;
}

/**
 * Connects a Babylon.js render loop to the service-framework scheduler's `renderTick`
 * channel, making Babylon.js a first-class renderer alongside Three.js.
 *
 * Ownership model: the bridge does NOT own the engine. Call dispose() to detach
 * from the loop; dispose the engine separately.
 *
 * DeltaTime units: milliseconds, matching ThreeRenderLoopBridge. The first frame
 * defaults to 16 ms (one 60 fps frame) because `performance.now()` returns the
 * time since page load, not since the engine started — the raw first-frame value
 * would be a meaningless large number.
 */
export class BabylonRenderLoopBridge {
  private loopCallbackBound = false;
  private frame = 0;
  private lastTimestamp = 0;

  // Pre-bound so the same function reference is passed to both runRenderLoop and
  // stopRenderLoop (Babylon identifies callbacks by reference, not by index).
  private readonly loopCallback: () => void;

  public constructor(private readonly options: BabylonRenderLoopBridgeOptions) {
    this.loopCallback = () => {
      const timestamp = performance.now();
      const context: LifecycleContext = {
        timestamp,
        deltaTime: this.lastTimestamp === 0 ? 16 : timestamp - this.lastTimestamp,
        frame: ++this.frame,
        source: "babylon",
      };
      this.lastTimestamp = timestamp;
      this.options.scheduler.emit("renderTick", context);
    };
  }

  public start(): void {
    if (this.loopCallbackBound) {
      return;
    }
    this.loopCallbackBound = true;
    this.options.host.runRenderLoop(this.loopCallback);
  }

  public stop(): void {
    if (!this.loopCallbackBound) {
      return;
    }
    this.loopCallbackBound = false;
    this.options.host.stopRenderLoop(this.loopCallback);
  }

  public dispose(): void {
    this.stop();
  }

  public get isRunning(): boolean {
    return this.loopCallbackBound;
  }

  public get currentFrame(): number {
    return this.frame;
  }
}
