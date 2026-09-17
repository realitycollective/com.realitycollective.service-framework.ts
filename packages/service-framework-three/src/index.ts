/**
 * Public entry point of the three.js binding: the render-loop bridge, and the
 * WebXR runtime adapter that gives a three.js or desktop app the same
 * `RuntimeAdapter` surface the IWSDK binding has.
 */
export { FIRST_FRAME_DELTA_MS, ThreeRenderLoopBridge } from "./three-render-loop-bridge.js";
export type {
  AnimationLoopHostLike,
  ThreeRenderLoopBridgeOptions
} from "./three-render-loop-bridge.js";

export { WebXRRuntimeAdapter } from "./webxr-runtime-adapter.js";
export type {
  WebXREventListener,
  WebXRManagerEventType,
  WebXRManagerLike,
  WebXRRuntimeAdapterOptions,
  WebXRSessionEventType,
  WebXRSessionLike,
  WebXRSystemLike
} from "./webxr-runtime-adapter.js";
