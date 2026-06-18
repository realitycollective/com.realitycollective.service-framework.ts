# Reality Collective Service Framework for TypeScript

A TypeScript-first implementation of the Reality Collective Service Framework, built as a centralized core runtime with thin host integrations for React, three.js, Babylon.js, and Meta IWSDK (WebXR).

Current release: **v1.0.1-preview.0**

## Packages

| Package | Description |
| --- | --- |
| `@realitycollective/service-framework` | Core runtime — DI, lifecycle, events, schedulers, configuration |
| `@realitycollective/service-framework-react` | React provider and hooks |
| `@realitycollective/service-framework-three` | three.js render-loop bridge |
| `@realitycollective/service-framework-babylon` | Babylon.js render-loop bridge *(new in v1.0.0)* |
| `@realitycollective/service-framework-iwsdk` | Meta IWSDK (WebXR) passive frame-source bridge *(new in v1.0.0)* |
| `@realitycollective/service-framework-client` | Opinionated client composition for React + three.js apps |

## Installation

```sh
# Core only
npm install @realitycollective/service-framework

# Core + React bindings
npm install @realitycollective/service-framework @realitycollective/service-framework-react

# Core + three.js bindings
npm install @realitycollective/service-framework @realitycollective/service-framework-three

# Core + Babylon.js bindings
npm install @realitycollective/service-framework @realitycollective/service-framework-babylon

# Core + Meta IWSDK (WebXR) bindings
npm install @realitycollective/service-framework @realitycollective/service-framework-iwsdk

# Full client (React + three.js composition layer)
npm install @realitycollective/service-framework-client
```

## Documentation

| Document | Description |
| --- | --- |
| [Web-Implementation-and-Usage.md](documentation/Web-Implementation-and-Usage.md) | Architecture, service authoring, consumption patterns, and advanced use cases |
| [Weather-Client-Walkthrough.md](documentation/Weather-Client-Walkthrough.md) | Step-by-step guide: build a deployable React weather app from scratch |
| [Migration-Unity-to-Web.md](documentation/Migration-Unity-to-Web.md) | Concept mapping for developers moving from the Unity framework |
| [Design.md](documentation/Design.md) | Architecture and design decisions |

## Examples

Each package ships a focused example in its own `Examples/` folder:

| Package | Example |
| --- | --- |
| `packages/service-framework/Examples/` | Plain web — `TimerScheduler`, no host bindings |
| `packages/service-framework-react/Examples/` | React — `ServiceFrameworkProvider` and `useService` |
| `packages/service-framework-three/Examples/` | three.js — `ThreeRenderLoopBridge` render loop |
| `packages/service-framework-babylon/Examples/` | Babylon.js — `BabylonRenderLoopBridge` render loop *(new in v1.0.0)* |
| `packages/service-framework-iwsdk/Examples/` | Meta IWSDK — passive frame source + `makeServiceBridgeSystem` *(new in v1.0.0)* |
| `packages/service-framework-client/Examples/` | React + three.js — full client composition |

## Runnable apps

See `runtime-examples/` for standalone Vite apps:

- `client-runtime-app-example` — higher-level client runtime reference
- `weather-client-example` — teaching-focused walkthrough (matches the documentation guide)

## Babylon.js integration

`service-framework-babylon` connects Babylon.js's `engine.runRenderLoop()` to the framework's `renderTick` scheduler channel — the same channel used by the three.js bridge. Services written against `BaseService<TConfig>` work unchanged on either renderer.

```ts
import { ManualScheduler, ServiceManager, createServiceProfile } from "@realitycollective/service-framework";
import { BabylonRenderLoopBridge } from "@realitycollective/service-framework-babylon";
import { Engine } from "@babylonjs/core";

const scheduler = new ManualScheduler();
const manager = new ServiceManager({ scheduler });

manager.initializeProfile(createServiceProfile("my-app", [/* your service registrations */]));
manager.start();

const engine = new Engine(canvas, true);
const bridge = new BabylonRenderLoopBridge({ scheduler, host: engine });
bridge.start();
// Every Babylon frame now emits renderTick to all registered services.
```

See `packages/service-framework-babylon/README.md` for full API documentation.

## Meta IWSDK integration

`service-framework-iwsdk` runs services inside the [Meta IWSDK](https://github.com/meta-quest/immersive-web-sdk) engine loop. Unlike the three.js / Babylon.js bridges, **IWSDK owns the loop**, so the shim is a *passive* frame source: a single ECS system pumps frames out to services and maps `visibilityState` to focus/pause (auto-pause when the headset comes off). Services depend only on `RuntimeAdapter`, never on `@iwsdk/core`.

```ts
import { createServiceProfile } from "@realitycollective/service-framework";
import { startServiceRuntime, makeServiceBridgeSystem } from "@realitycollective/service-framework-iwsdk";
import { createSystem, VisibilityState } from "@iwsdk/core";

const { manager, adapter } = startServiceRuntime(world, (adapter) =>
  createServiceProfile("my-app", [/* registrations wired to `adapter` */]),
);

world.registerSystem(
  makeServiceBridgeSystem({ adapter, manager, world, createSystem, visibleState: VisibilityState.Visible }),
);
// Services tick only while the session is visible; idle in the 2D/browser preview.
```

See `packages/service-framework-iwsdk/README.md` for full API documentation.
