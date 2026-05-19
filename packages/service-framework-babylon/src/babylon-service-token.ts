import { ServiceToken } from "@realitycollective/service-framework";
import type { BaseBabylonService } from "./base-babylon-service.js";

/**
 * Well-known token for the primary Babylon.js scene service.
 *
 * Consuming services resolve the scene service by this token rather than
 * importing its concrete class, preserving loose coupling:
 *
 *   const sceneService = this.manager.resolve(BABYLON_SCENE_SERVICE_TOKEN);
 */
export const BABYLON_SCENE_SERVICE_TOKEN =
  new ServiceToken<BaseBabylonService>("BabylonSceneService");
