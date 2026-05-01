import { ServiceManager } from "@realitycollective/service-framework";
import { ThreeRenderLoopBridge } from "@realitycollective/service-framework-three";
import type { BaseFrameworkClientRuntimeLike, BaseFrameworkClientRuntimeOptions } from "./contracts.js";
export declare class BaseFrameworkClientRuntime implements BaseFrameworkClientRuntimeLike {
    readonly scheduler: import("@realitycollective/service-framework").IScheduler;
    readonly environment: import("@realitycollective/service-framework").IEnvironmentDescriptor;
    readonly profile: import("@realitycollective/service-framework").ServiceProfile;
    readonly manager: ServiceManager;
    private renderLoopBridge;
    constructor(options?: BaseFrameworkClientRuntimeOptions);
    bindRenderLoop(host: ConstructorParameters<typeof ThreeRenderLoopBridge>[0]["host"]): ThreeRenderLoopBridge;
    dispose(): void;
}
//# sourceMappingURL=runtime.d.ts.map