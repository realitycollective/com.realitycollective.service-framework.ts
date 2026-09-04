# `@realitycollective/service-framework-babylon`

Babylon.js render-loop bindings for the [Reality Collective TypeScript Service Framework](https://github.com/realitycollective/com.realitycollective.service-framework.ts).

Provides the same `renderTick` contract and the same `RuntimeAdapter` seam as `@realitycollective/service-framework-three`. Services written against `BaseService<TConfig>` or against `RuntimeAdapter` run unchanged on either renderer.

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| `@realitycollective/service-framework-babylon` | Versioned with the repository; see the current release line in the root README | This package |

---

## Quick start

```typescript
import { ManualScheduler, ServiceManager, createServiceProfile, createServiceToken, BaseService } from "@realitycollective/service-framework";
import { BabylonRenderLoopBridge } from "@realitycollective/service-framework-babylon";
import { Engine, Scene } from "@babylonjs/core";

// 1. Create a scheduler and manager
const scheduler = new ManualScheduler();
const manager = new ServiceManager({ scheduler });

// 2. Register your services
manager.initializeProfile(createServiceProfile("my-app", [/* registrations */]));
manager.start();

// 3. Wire the bridge to the engine (engine created by your scene service)
const engine = new Engine(canvas, true);
const bridge = new BabylonRenderLoopBridge({ scheduler, host: engine });
bridge.start();
```

The bridge emits `renderTick` on the scheduler every frame. Services receive it through `render(context: LifecycleContext)` or by subscribing directly:

```typescript
this.scheduler.subscribe("renderTick", ctx => {
  // ctx.deltaTime - milliseconds since last frame (16 on first frame)
  // ctx.frame     - monotonically increasing frame counter
  // ctx.source    - "babylon"
});
```

---

## Relationship to `service-framework-three`

Both bridges implement the identical `renderTick` contract. The difference is the engine API:

| | Three.js | Babylon.js |
|-|----------|------------|
| Loop API | `renderer.setAnimationLoop(cb)` | `engine.runRenderLoop(cb)` |
| Timestamp | Provided by browser as callback arg | Read from `performance.now()` |
| First-frame delta | 16 ms | 16 ms |
| Runtime adapter | `WebXRRuntimeAdapter`, over `navigator.xr` and `renderer.xr` | `BabylonRuntimeAdapter`, over `WebXRDefaultExperience` |
| Session negotiation | `navigator.xr.requestSession` | `baseExperience.enterXRAsync` |

Services that listen to `renderTick`, or that depend on `RuntimeAdapter`, are renderer-agnostic - only the bootstrap code changes.

---

## WebXR runtime adapter

`BabylonRuntimeAdapter` gives a Babylon app the `RuntimeAdapter` seam from `@realitycollective/service-framework`: per-frame fan-out, capability flags, and a session facet. It is the Babylon counterpart of the three.js package's `WebXRRuntimeAdapter`, and behaves the same way, so a service written against `RuntimeAdapter` runs on either renderer and unit-tests headless against `MockRuntimeAdapter`.

The adapter orchestrates the entry points Babylon already provides - the experience helper for session negotiation, the session manager for the live `XRSession`, `runRenderLoop` for frames. It renders nothing and owns no scene state.

```typescript
import { ServiceManager } from "@realitycollective/service-framework";
import { BabylonRuntimeAdapter } from "@realitycollective/service-framework-babylon";
import { Engine, Scene, WebXRDefaultExperience } from "@babylonjs/core";

const engine = new Engine(canvas, true);
const scene = new Scene(engine);
const manager = new ServiceManager();

// disableDefaultUI, because the app owns the button and the adapter owns the session.
const xr = await WebXRDefaultExperience.CreateAsync(scene, { disableDefaultUI: true });
const adapter = new BabylonRuntimeAdapter({
  xr: xr.baseExperience,
  host: engine,
  scheduler: manager.scheduler
});

// The adapter now owns the render loop and emits renderTick itself. Do not also
// start a BabylonRenderLoopBridge: one loop owner is enough.
adapter.start();

document.querySelector("#enter-vr")?.addEventListener("click", async () => {
  const result = await adapter.session.request("immersive-vr");

  if (!result.ok) {
    console.warn(`No session: ${result.reason}`);
  }
});
```

Pass `xr` and omit `host` to keep the loop yourself; the app then calls `adapter.emitFrame(timestamp, deltaSeconds)` per frame. Pass `host` and omit `scheduler` to own the loop without emitting `renderTick`.

Session requests resolve with a result rather than throwing, because a host that cannot start a session is a normal runtime condition:

| `result.reason` | Meaning |
| --- | --- |
| `unsupported` | No `xr` was given, or `isSessionSupportedAsync` says the mode is unavailable |
| `denied` | The user, the permission prompt or the permissions policy refused |
| `timeout` | Nothing came back inside `timeoutMs` (default 10000) |
| `error` | Anything else, with the original rejection on `result.error` |

A desktop build with no headset is the ordinary case, not a failure: build the same page, construct the adapter with `xr: null` (or omit it), and every request returns `{ ok: false, reason: "unsupported" }` while capabilities stay at the all-false defaults. Services gate on `getCapabilities()` and run in 2D.

The session facet reports `getState()` as `none`, `requesting`, `active` or `ending`, and pushes changes through `onStateChange`. A session started outside the adapter - by Babylon's own enter-XR UI, for instance - is followed through `onStateChangedObservable`, so the facet is correct either way. `onVisibilityChange` reports the session's own `visible`, `visible-blurred` and `hidden`, and `non-immersive` while there is no session at all.

Capabilities come from the core's `deriveCapabilities`, re-derived when a session starts or ends and when its input sources change; subscribers are notified only when a flag actually changes. `setCapabilities` is a manual override layer on top, dropped by `clearCapabilityOverrides()`. `refreshCapabilities()` re-derives on demand, for an experience that carries no observables to push with.

Every Babylon type the adapter is written against is structural, so this package still imports `@babylonjs/core` nowhere and the adapter is tested with fakes. The shapes follow the Babylon 7 API, and anything a version might move or drop - the session manager, the observables, `isSessionSupportedAsync` - is optional and read through a guard.

---

## Optional base class

`BaseBabylonService<TConfig>` is a convenience base for secondary services that receive an already-constructed engine and scene through their config:

```typescript
import { BaseBabylonService, type BabylonServiceConfiguration } from "@realitycollective/service-framework-babylon";

interface MyConfig extends BabylonServiceConfiguration {
  readonly meshName: string;
}

class MyService extends BaseBabylonService<MyConfig> {
  override start(): void {
    this.scheduler.subscribe("renderTick", ctx => this.onRenderTick(ctx));
  }

  override onRenderTick(): void {
    const mesh = this.scene.getMeshByName(this.serviceConfig.meshName);
    if (mesh) mesh.rotation.y += 0.01;
    this.scene.render();
  }
}
```

Services that **own** the engine (create it themselves) should extend `BaseService<TConfig>` directly.

---

## Running tests

From the workspace root (`src/com.realitycollective.service-framework.ts/`):

```bash
npm test
```

Coverage gates this package. The root include list measures `packages/service-framework-babylon/src/**/*.ts` at the same 100% line, branch, function and statement thresholds as the core, client, IWSDK and three.js packages.

## Running the example app

```bash
cd runtime-examples/facilities-viewer-example
npm install
npm run dev
```

Open `http://localhost:5175` - you should see a rotating cube on a dark background.

---

## Contributing

See the [main repository contribution guide](https://github.com/realitycollective/com.realitycollective.service-framework.ts/blob/main/CONTRIBUTING.md).

## Live examples

- Weather client walkthrough: **[service-framework-weather.pages.dev](https://service-framework-weather.pages.dev)**
- Client runtime reference: **[service-framework-client-app.pages.dev](https://service-framework-client-app.pages.dev)**

## License

MIT
