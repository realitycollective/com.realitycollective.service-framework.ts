import {
  ManualScheduler,
  ServiceManager
} from "@realitycollective/service-framework";
import { ThreeRenderLoopBridge } from "@realitycollective/service-framework-three";
import type { BaseFrameworkClientRuntimeLike, BaseFrameworkClientRuntimeOptions } from "./contracts.js";
import { createBaseFrameworkClientEnvironment, createBaseFrameworkClientProfile } from "./profile.js";

export class BaseFrameworkClientRuntime implements BaseFrameworkClientRuntimeLike {
  public readonly scheduler;
  public readonly environment;
  public readonly profile;
  public readonly manager;

  private renderLoopBridge: ThreeRenderLoopBridge | undefined;

  public constructor(options: BaseFrameworkClientRuntimeOptions = {}) {
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

  public bindRenderLoop(host: ConstructorParameters<typeof ThreeRenderLoopBridge>[0]["host"]): ThreeRenderLoopBridge {
    this.renderLoopBridge?.dispose();
    this.renderLoopBridge = new ThreeRenderLoopBridge({
      scheduler: this.manager.scheduler,
      host
    });
    this.renderLoopBridge.start();
    return this.renderLoopBridge;
  }

  public dispose(): void {
    this.renderLoopBridge?.dispose();
    this.manager.scheduler.dispose();
  }
}
