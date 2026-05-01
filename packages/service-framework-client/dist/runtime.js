import { ManualScheduler, ServiceManager } from "@realitycollective/service-framework";
import { ThreeRenderLoopBridge } from "@realitycollective/service-framework-three";
import { createBaseFrameworkClientEnvironment, createBaseFrameworkClientProfile } from "./profile.js";
export class BaseFrameworkClientRuntime {
    scheduler;
    environment;
    profile;
    manager;
    renderLoopBridge;
    constructor(options = {}) {
        this.scheduler = options.scheduler ?? new ManualScheduler();
        this.environment = options.environment ?? createBaseFrameworkClientEnvironment(options.environmentOptions);
        this.profile = options.profile ?? createBaseFrameworkClientProfile(options.profileOptions);
        this.manager = new ServiceManager({
            scheduler: this.scheduler,
            environment: this.environment
        });
        this.manager.initializeProfile(this.profile);
        if (options.autoStart !== false) {
            this.manager.start();
        }
    }
    bindRenderLoop(host) {
        this.renderLoopBridge?.dispose();
        this.renderLoopBridge = new ThreeRenderLoopBridge({
            scheduler: this.manager.scheduler,
            host
        });
        this.renderLoopBridge.start();
        return this.renderLoopBridge;
    }
    dispose() {
        this.renderLoopBridge?.dispose();
        this.manager.scheduler.dispose();
    }
}
//# sourceMappingURL=runtime.js.map