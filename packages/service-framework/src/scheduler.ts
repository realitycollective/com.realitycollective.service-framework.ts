import type {
  IScheduler,
  LifecycleContext,
  SchedulerChannel,
  SchedulerEventMap,
  SchedulerHandler
} from "./contracts.js";

type SubscriptionMap = {
  [TChannel in SchedulerChannel]: Set<SchedulerHandler<TChannel>>;
};

type HandlerListMap = {
  [TChannel in SchedulerChannel]: SchedulerHandler<TChannel>[] | null;
};

export class ManualScheduler implements IScheduler {
  private readonly subscriptions: SubscriptionMap = {
    startup: new Set(),
    tick: new Set(),
    lateTick: new Set(),
    fixedTick: new Set(),
    renderTick: new Set(),
    focusChange: new Set(),
    pauseChange: new Set(),
    dispose: new Set()
  };

  /**
   * The handler list each channel last emitted with, rebuilt only when a
   * handler is added or removed. `emit` used to copy the channel's Set on
   * every call so that a handler subscribing or unsubscribing mid-emit could
   * not alter the iteration in progress; that copy was one array allocation
   * per emitted channel per frame. The cached list gives the same guarantee,
   * because a subscribe or unsubscribe drops the cache while the emit already
   * running keeps the array it started with, and it allocates only when the
   * set of handlers actually changes.
   */
  private readonly handlerLists: HandlerListMap = {
    startup: null,
    tick: null,
    lateTick: null,
    fixedTick: null,
    renderTick: null,
    focusChange: null,
    pauseChange: null,
    dispose: null
  };

  public subscribe<TChannel extends SchedulerChannel>(channel: TChannel, handler: SchedulerHandler<TChannel>): () => void {
    const bucket = this.subscriptions[channel] as Set<SchedulerHandler<TChannel>>;
    bucket.add(handler);
    this.handlerLists[channel] = null;

    return () => {
      bucket.delete(handler);
      this.handlerLists[channel] = null;
    };
  }

  public emit<TChannel extends SchedulerChannel>(channel: TChannel, payload: SchedulerEventMap[TChannel]): void {
    let handlers = this.handlerLists[channel] as SchedulerHandler<TChannel>[] | null;

    if (handlers === null) {
      handlers = Array.from(this.subscriptions[channel]) as SchedulerHandler<TChannel>[];
      (this.handlerLists as Record<SchedulerChannel, unknown>)[channel] = handlers;
    }

    for (const handler of handlers) {
      handler(payload);
    }
  }

  public dispose(): void {
    this.emit("dispose", undefined);

    for (const bucket of Object.values(this.subscriptions)) {
      bucket.clear();
    }

    for (const channel of Object.keys(this.handlerLists) as SchedulerChannel[]) {
      this.handlerLists[channel] = null;
    }
  }
}

export interface TimerSchedulerOptions {
  readonly tickIntervalMs?: number;
  readonly fixedIntervalMs?: number;
  readonly now?: () => number;
  readonly setIntervalFn?: typeof setInterval;
  readonly clearIntervalFn?: typeof clearInterval;
  readonly requestAnimationFrameFn?: (callback: FrameRequestCallback) => number;
  readonly cancelAnimationFrameFn?: (handle: number) => void;
}

export class TimerScheduler extends ManualScheduler {
  private readonly now: () => number;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private readonly requestAnimationFrameFn: ((callback: FrameRequestCallback) => number) | undefined;
  private readonly cancelAnimationFrameFn: ((handle: number) => void) | undefined;
  private readonly tickIntervalMs: number;
  private readonly fixedIntervalMs: number;
  private tickHandle: ReturnType<typeof setInterval> | undefined;
  private lateTickHandle: ReturnType<typeof setInterval> | undefined;
  private fixedHandle: ReturnType<typeof setInterval> | undefined;
  private renderHandle: number | undefined;
  private running = false;
  private frame = 0;
  private lastTickTimestamp = 0;
  private lastFixedTimestamp = 0;
  private lastRenderTimestamp = 0;

  public constructor(options: TimerSchedulerOptions = {}) {
    super();
    this.tickIntervalMs = options.tickIntervalMs ?? 16;
    this.fixedIntervalMs = options.fixedIntervalMs ?? 50;
    this.now = options.now ?? (() => Date.now());
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
    this.requestAnimationFrameFn = options.requestAnimationFrameFn;
    this.cancelAnimationFrameFn = options.cancelAnimationFrameFn;
  }

  public start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.emit("startup", undefined);

    this.tickHandle = this.setIntervalFn(() => {
      const current = this.now();
      const context = this.createLifecycleContext(current, current - this.lastTickTimestamp || this.tickIntervalMs, "tick");
      this.lastTickTimestamp = current;
      this.emit("tick", context);
    }, this.tickIntervalMs);

    this.lateTickHandle = this.setIntervalFn(() => {
      const current = this.now();
      const context = this.createLifecycleContext(current, this.tickIntervalMs, "lateTick");
      this.emit("lateTick", context);
    }, this.tickIntervalMs);

    this.fixedHandle = this.setIntervalFn(() => {
      const current = this.now();
      const context = this.createLifecycleContext(current, current - this.lastFixedTimestamp || this.fixedIntervalMs, "fixedTick");
      this.lastFixedTimestamp = current;
      this.emit("fixedTick", context);
    }, this.fixedIntervalMs);

    if (this.requestAnimationFrameFn) {
      const step: FrameRequestCallback = (timestamp) => {
        if (!this.running) {
          return;
        }

        const context = this.createLifecycleContext(timestamp, timestamp - this.lastRenderTimestamp || this.tickIntervalMs, "renderTick");
        this.lastRenderTimestamp = timestamp;
        this.emit("renderTick", context);
        this.renderHandle = this.requestAnimationFrameFn?.(step);
      };

      this.renderHandle = this.requestAnimationFrameFn(step);
    }
  }

  public stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.tickHandle) {
      this.clearIntervalFn(this.tickHandle);
      this.tickHandle = undefined;
    }

    if (this.lateTickHandle) {
      this.clearIntervalFn(this.lateTickHandle);
      this.lateTickHandle = undefined;
    }

    if (this.fixedHandle) {
      this.clearIntervalFn(this.fixedHandle);
      this.fixedHandle = undefined;
    }

    if (this.renderHandle !== undefined && this.cancelAnimationFrameFn) {
      this.cancelAnimationFrameFn(this.renderHandle);
      this.renderHandle = undefined;
    }
  }

  public override dispose(): void {
    this.stop();
    super.dispose();
  }

  private createLifecycleContext(timestamp: number, deltaTime: number, source: string): LifecycleContext {
    this.frame += 1;

    return {
      timestamp,
      deltaTime,
      frame: this.frame,
      source
    };
  }
}
