# Reality Collective Service Framework for TypeScript

A TypeScript-first implementation of the Reality Collective Service Framework, One core runtime, plus a small connector package for each host it runs in: React, three.js, Babylon.js and Meta IWSDK (WebXR).

Current release: **v1.0.1-preview.3**

## Packages

| Package | Description |
| --- | --- |
| `@realitycollective/service-framework` | Core runtime - DI, lifecycle, events, schedulers, configuration |
| `@realitycollective/service-framework-react` | React provider and hooks |
| `@realitycollective/service-framework-three` | three.js render-loop bridge and WebXR runtime adapter |
| `@realitycollective/service-framework-babylon` | Babylon.js render-loop bridge and WebXR runtime adapter |
| `@realitycollective/service-framework-iwsdk` | Meta IWSDK (WebXR) passive frame-source bridge *(new in v1.0.0)* |
| `@realitycollective/service-framework-client` | React + three.js already wired together, so you add services and go |

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
| `packages/service-framework/Examples/` | Plain web - `TimerScheduler`, no host bindings |
| `packages/service-framework-react/Examples/` | React - `ServiceFrameworkProvider` and `useService` |
| `packages/service-framework-three/Examples/` | three.js - `ThreeRenderLoopBridge` render loop |
| `packages/service-framework-babylon/Examples/` | Babylon.js - `BabylonRenderLoopBridge` render loop *(new in v1.0.0)* |
| `packages/service-framework-iwsdk/Examples/` | Meta IWSDK - passive frame source + `makeServiceBridgeSystem` *(new in v1.0.0)* |
| `packages/service-framework-client/Examples/` | React + three.js - full client composition |

## Runnable apps

See `runtime-examples/` for standalone Vite apps. They are deliberately **not** workspace members: each depends on the framework by `file:` path and aliases to the built `dist`, so they exercise the same path a published consumer takes.

| App | What it shows | Live |
| --- | --- | --- |
| `weather-client-example` | Teaching-focused walkthrough (matches the documentation guide) | [`service-framework-weather.pages.dev`](https://service-framework-weather.pages.dev) |
| `client-runtime-app-example` | Higher-level client runtime reference | [`service-framework-client-app.pages.dev`](https://service-framework-client-app.pages.dev) |

Both are built on every pull request and deployed from `main` by the **Deploy** workflow. Pull requests deploy to the isolated `service-framework-weather-test` and `service-framework-client-app-test` projects, so a PR can never touch production.

Run either locally:

```sh
cd runtime-examples/weather-client-example
npm install     # resolves the framework from ../../packages via file: deps
npm run dev     # rebuilds the framework first, then serves on https://localhost:5174
```

## Automation (`.github/workflows/`)

Two workflows ship in every Reality Collective TypeScript repository, with the same names everywhere. `ci.yml` both gates and deploys: the build job runs once and the deploy jobs consume its artifacts, so nothing is built or tested twice.

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | every PR + push to `main` / `development` | Build, typecheck, test with 100% coverage gates, `verify:pack`, and both runtime examples built. On a PR it then deploys them to the `-test` Pages projects; on a push to `main`, to production. The deploy steps skip when the Cloudflare secrets are absent, leaving a pure build gate |
| `publish-npm.yml` | manual dispatch | packs all six packages and publishes to **npmjs.com** with provenance - `preview` dist-tag from `development`, `latest` from `main`. **Defaults to a dry run** |

## Babylon.js integration

`service-framework-babylon` connects Babylon.js's `engine.runRenderLoop()` to the framework's `renderTick` scheduler channel - the same channel used by the three.js bridge. Services written against `BaseService<TConfig>` work unchanged on either renderer.

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

The package also ships `BabylonRuntimeAdapter`, a `RuntimeAdapter` over Babylon's `WebXRDefaultExperience`. It gives a Babylon app the same frames, capability flags and session facet the three.js and IWSDK bindings expose, and it can own the render loop itself, in which case the bridge is not needed.

See `packages/service-framework-babylon/README.md` for full API documentation.

## Meta IWSDK integration

`service-framework-iwsdk` runs services inside the [Meta IWSDK](https://github.com/meta-quest/immersive-web-sdk) engine loop. The three.js and Babylon.js bridges drive the render loop themselves. IWSDK does not work that way: it owns the loop, so this package only relays frames rather than producing them.

IWSDK calls one system once per frame, and that system passes the frame on to your services. It also watches IWSDK's `visibilityState`, so services pause when the headset comes off and resume when it goes back on. Your services only ever reference `RuntimeAdapter`, never `@iwsdk/core` directly.

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

## What this stack is and is not

The Reality Collective WebXR packages aim at one outcome: an app's logic, input handling, interactions and UI should not care which engine hosts them. Each family ships an engine-free core and thin adapters for Meta IWSDK, plain three.js and WebXR, and Google XR Blocks. When an app still has to reach into the host, either a contract is missing, which is a bug to report, or the app is overreaching.

Portable world-building is not a current promise. Scene content (meshes, prefabs, placement) is built by the app, ideally behind a factory interface the app owns, so that a second host can implement the same factories. A shared content descriptor, following the shape of the UI family's `SceneDescriptor`, will be considered only when a second host is actually targeted. Meta's `iwsdk.scene.v1` format is an acceptable authoring interchange in the meantime.

Position recorded on 2026-09-03 from the Pale Signal client's gaps report.
