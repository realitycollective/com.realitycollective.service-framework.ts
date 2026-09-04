/**
 * Public entry point of the Babylon.js binding: the render-loop bridge, the
 * optional base service, and the runtime adapter that gives a Babylon app the
 * same `RuntimeAdapter` surface the three.js and IWSDK bindings have.
 */
export { BabylonRenderLoopBridge, FIRST_FRAME_DELTA_MS } from "./babylon-render-loop-bridge.js";
export type { BabylonEngineHostLike, BabylonRenderLoopBridgeOptions } from "./babylon-render-loop-bridge.js";
export { BaseBabylonService } from "./base-babylon-service.js";
export type { BabylonServiceConfiguration } from "./base-babylon-service.js";
export { BABYLON_SCENE_SERVICE_TOKEN } from "./babylon-service-token.js";

export {
  BABYLON_WEBXR_STATE,
  BabylonRuntimeAdapter,
  DEFAULT_REFERENCE_SPACE_TYPE
} from "./babylon-runtime-adapter.js";
export type {
  BabylonObservableLike,
  BabylonObserverLike,
  BabylonRuntimeAdapterOptions,
  BabylonSessionManagerLike,
  BabylonWebXRState,
  BabylonXREventListener,
  BabylonXRExperienceLike,
  BabylonXRSessionEventType,
  BabylonXRSessionLike
} from "./babylon-runtime-adapter.js";
