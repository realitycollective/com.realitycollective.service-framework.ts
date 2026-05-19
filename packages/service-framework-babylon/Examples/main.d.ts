/**
 * service-framework-babylon — minimal usage example
 *
 * Mirrors the Three.js equivalent at packages/service-framework-three/Examples/main.ts.
 *
 * The mock host replaces a real Babylon.js Engine so this snippet runs in
 * any Node.js environment and is also safe to paste into a browser REPL with
 * a real Engine swapped in.
 *
 * Real-app usage:
 *
 *   import { Engine } from "@babylonjs/core";
 *   const engine = new Engine(canvas, true);
 *   const bridge = new BabylonRenderLoopBridge({ scheduler, host: engine });
 *   bridge.start();
 *   // The bridge calls engine.runRenderLoop() internally.
 *   // engine.resize() should be called on window resize separately.
 */
export {};
//# sourceMappingURL=main.d.ts.map