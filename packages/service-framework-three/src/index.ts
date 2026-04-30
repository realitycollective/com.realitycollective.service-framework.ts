import type { IScheduler, LifecycleContext } from "@realitycollective/service-framework";

export interface AnimationLoopHostLike {
  setAnimationLoop(callback: ((timestamp: number) => void) | null): void;
}

export interface ThreeRenderLoopBridgeOptions {
  readonly scheduler: IScheduler;
  readonly host: AnimationLoopHostLike;
}

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
        deltaTime: this.lastTimestamp === 0 ? 16 : timestamp - this.lastTimestamp,
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
