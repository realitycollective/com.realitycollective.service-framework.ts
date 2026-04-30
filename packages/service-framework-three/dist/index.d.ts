import type { IScheduler } from "@realitycollective/service-framework";
export interface AnimationLoopHostLike {
    setAnimationLoop(callback: ((timestamp: number) => void) | null): void;
}
export interface ThreeRenderLoopBridgeOptions {
    readonly scheduler: IScheduler;
    readonly host: AnimationLoopHostLike;
}
export declare class ThreeRenderLoopBridge {
    private readonly options;
    private animationLoopBound;
    private frame;
    private lastTimestamp;
    constructor(options: ThreeRenderLoopBridgeOptions);
    start(): void;
    stop(): void;
    dispose(): void;
}
//# sourceMappingURL=index.d.ts.map