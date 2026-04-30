import type { IScheduler, SchedulerChannel, SchedulerEventMap, SchedulerHandler } from "./contracts.js";
export declare class ManualScheduler implements IScheduler {
    private readonly subscriptions;
    subscribe<TChannel extends SchedulerChannel>(channel: TChannel, handler: SchedulerHandler<TChannel>): () => void;
    emit<TChannel extends SchedulerChannel>(channel: TChannel, payload: SchedulerEventMap[TChannel]): void;
    dispose(): void;
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
export declare class TimerScheduler extends ManualScheduler {
    private readonly now;
    private readonly setIntervalFn;
    private readonly clearIntervalFn;
    private readonly requestAnimationFrameFn;
    private readonly cancelAnimationFrameFn;
    private readonly tickIntervalMs;
    private readonly fixedIntervalMs;
    private tickHandle;
    private lateTickHandle;
    private fixedHandle;
    private renderHandle;
    private running;
    private frame;
    private lastTickTimestamp;
    private lastFixedTimestamp;
    private lastRenderTimestamp;
    constructor(options?: TimerSchedulerOptions);
    start(): void;
    stop(): void;
    dispose(): void;
    private createLifecycleContext;
}
//# sourceMappingURL=scheduler.d.ts.map