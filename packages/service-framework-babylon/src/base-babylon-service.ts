import { BaseService } from "@realitycollective/service-framework";
import type { LifecycleContext } from "@realitycollective/service-framework";

/**
 * Config shape required by BaseBabylonService.
 *
 * TEngine and TScene default to `unknown`, so you can extend without Babylon
 * imports in the base package. Consumer code supplies the concrete types:
 *
 *   import { Engine, Scene } from "@babylonjs/core";
 *
 *   interface MyConfig extends BabylonServiceConfiguration<Engine, Scene> {
 *     readonly meshName: string;
 *   }
 *
 * This design mirrors ThreeRenderLoopBridge's structural-interface approach:
 * the service-framework package never imports from the renderer package
 * directly, so any Babylon.js version (including future ones that change
 * their module resolution) works without updating this package.
 */
export interface BabylonServiceConfiguration<TEngine = unknown, TScene = unknown> {
  readonly engine: TEngine;
  readonly scene: TScene;
}

/**
 * Convenience base for secondary services that receive a pre-built Engine and
 * Scene through their config (e.g. a model-loader service that runs alongside
 * a scene service which already constructed the engine).
 *
 * Services that OWN the engine (create it in start()) should extend
 * BaseService<TConfig> directly.
 *
 * The `engine` and `scene` getters are typed via TConfig's index access, so
 * they resolve to the concrete types the consumer passed in — full IDE
 * autocomplete with zero renderer imports in this package.
 */
export abstract class BaseBabylonService<
  TConfig extends BabylonServiceConfiguration = BabylonServiceConfiguration,
> extends BaseService<TConfig> {
  protected get engine(): TConfig["engine"] {
    return this.serviceConfig.engine;
  }

  protected get scene(): TConfig["scene"] {
    return this.serviceConfig.scene;
  }

  /**
   * Override in subclasses to react to render ticks. Wire this up by
   * subscribing to the scheduler in start():
   *
   *   override start(): void {
   *     this.scheduler.subscribe("renderTick", ctx => this.onRenderTick(ctx));
   *   }
   */
  public onRenderTick(_context: LifecycleContext): void {}
}
