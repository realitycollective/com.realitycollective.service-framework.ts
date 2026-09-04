/**
 * three.js render-loop bridge: connects `renderer.setAnimationLoop()` to the
 * framework's `renderTick` scheduler channel.
 *
 * The host is structural - anything with `setAnimationLoop` - so this package
 * never imports `three` and builds with no renderer, no WebGL and no DOM.
 */
import type { IScheduler, LifecycleContext } from "@realitycollective/service-framework";

/** The slice of a three.js renderer the bridge and the adapter drive. */
export interface AnimationLoopHostLike {
  setAnimationLoop(callback: ((timestamp: number) => void) | null): void;
}

export interface ThreeRenderLoopBridgeOptions {
  readonly scheduler: IScheduler;
  readonly host: AnimationLoopHostLike;
}

/** Delta reported for the first frame, where there is no previous timestamp. */
export const FIRST_FRAME_DELTA_MS = 16;

export class ThreeRenderLoopBridge {
  private animationLoopBound = false;
  private frame = 0;
  private lastTimestamp = 0;

  public constructor(
    private readonly options: ThreeRenderLoopBridgeOptions
  ) {}

  public start(): void {
    if (this.animationLoopBound) {
      return;
    }

    this.animationLoopBound = true;

    this.options.host.setAnimationLoop((timestamp) => {
      const context: LifecycleContext = {
        timestamp,
        deltaTime: this.lastTimestamp === 0 ? FIRST_FRAME_DELTA_MS : timestamp - this.lastTimestamp,
        frame: ++this.frame,
        source: "three"
      };

      this.lastTimestamp = timestamp;
      this.options.scheduler.emit("renderTick", context);
    });
  }

  public stop(): void {
    if (!this.animationLoopBound) {
      return;
    }

    this.animationLoopBound = false;
    this.options.host.setAnimationLoop(null);
  }

  public dispose(): void {
    this.stop();
  }
}
