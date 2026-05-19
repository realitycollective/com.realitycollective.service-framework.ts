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
import { BaseService, ManualScheduler, ServiceManager, createServiceProfile, createServiceToken, } from "@realitycollective/service-framework";
import { BabylonRenderLoopBridge } from "@realitycollective/service-framework-babylon";
// ---------------------------------------------------------------------------
// Service — logs each rendered frame (replace with your scene logic)
// ---------------------------------------------------------------------------
const RENDER_STATS_TOKEN = createServiceToken("RenderStatsService");
class RenderStatsService extends BaseService {
    render(context) {
        console.log(`Frame ${context.frame} via ${context.source} — Δ${context.deltaTime.toFixed(2)} ms`);
    }
}
// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
const scheduler = new ManualScheduler();
const manager = new ServiceManager({ scheduler });
manager.initializeProfile(createServiceProfile("babylon-example", [
    {
        token: RENDER_STATS_TOKEN,
        useFactory: (context) => new RenderStatsService(context),
    },
]));
manager.start();
// ---------------------------------------------------------------------------
// Bridge — swap the mock host for a real Babylon.js Engine in a browser app
// ---------------------------------------------------------------------------
const bridge = new BabylonRenderLoopBridge({
    scheduler,
    host: {
        runRenderLoop(callback) {
            // Simulate three frames synchronously
            callback();
            callback();
            callback();
        },
        stopRenderLoop() { },
    },
});
bridge.start();
// Expected console output:
// Frame 1 via babylon — Δ16.00 ms
// Frame 2 via babylon — Δ<small number> ms
// Frame 3 via babylon — Δ<small number> ms
console.log(`Bridge ran ${bridge.currentFrame} frames.`);
bridge.dispose();
//# sourceMappingURL=main.js.map