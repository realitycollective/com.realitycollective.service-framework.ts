# `@realitycollective/service-framework-babylon`

Babylon.js render-loop bindings for the [Reality Collective TypeScript Service Framework](https://github.com/realitycollective/com.realitycollective.service-framework.ts).

Provides the same `renderTick` contract as `@realitycollective/service-framework-three`, making Babylon.js a first-class renderer alongside Three.js. Services written against `BaseService<TConfig>` run unchanged on either renderer.

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| `@realitycollective/service-framework-babylon` | `0.1.0` | This package |

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
  // ctx.deltaTime — milliseconds since last frame (16 on first frame)
  // ctx.frame     — monotonically increasing frame counter
  // ctx.source    — "babylon"
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

Services that listen to `renderTick` are renderer-agnostic — only the bootstrap code changes.

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

Coverage includes `packages/service-framework-babylon/src/**/*.ts`.

## Running the example app

```bash
cd runtime-examples/facilities-viewer-example
npm install
npm run dev
```

Open `http://localhost:5175` — you should see a rotating cube on a dark background.

---

## Contributing

See the [main repository contribution guide](https://github.com/realitycollective/com.realitycollective.service-framework.ts/blob/main/CONTRIBUTING.md).

## License

MIT
