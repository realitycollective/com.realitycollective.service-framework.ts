# `@realitycollective/service-framework-iwsdk`

Meta **IWSDK** (WebXR) frame-source bindings for the [Reality Collective TypeScript Service Framework](https://github.com/realitycollective/com.realitycollective.service-framework.ts).

Lets `@realitycollective/service-framework` services run inside the [IWSDK](https://github.com/meta-quest/immersive-web-sdk) engine loop without each project re-implementing the bridge layer. Services written against `BaseService<TConfig>` run unchanged here, on three.js, or on Babylon.js.

---

## How it differs from the render-loop bridges

`service-framework-three` and `service-framework-babylon` **own** the render loop: the bridge calls `renderer.setAnimationLoop(...)` or `engine.runRenderLoop(...)` itself.

IWSDK is different. It already owns the render loop, the XR session, input, and its Entity Component System (ECS, the pattern IWSDK uses to organise scene objects and the code that runs on them). So this package must not start a loop of its own.

Instead it is a **passive frame source**: it receives frames rather than producing them.

IWSDK calls one system, `ServiceBridgeSystem`, once per frame. That system hands the frame to every subscribed service through `IWSDKAdapter`. It also maps IWSDK's `visibilityState` onto the manager's focus and pause signals, so services pause when the headset comes off.

```
IWSDK World  (render loop, XR session, input, ECS)
   │  world.registerSystem(makeServiceBridgeSystem({ ... }))
   ▼
ServiceBridgeSystem        ← the only place the engine touches services
   every update(delta, time):
     • visibilityState → manager.emitFocusChange / emitPauseChange
     • if focused: adapter.emitFrame(time, delta)
   ▼
IWSDKAdapter (RuntimeAdapter)  →  onFrame fan-out  →  services
   ▼
ServiceManager  →  your SnapshotService graph
```

**Invariant:** services depend only on `RuntimeAdapter`, never on `@iwsdk/core`. That is what keeps them unit-testable headless - swap `IWSDKAdapter` for `MockRuntimeAdapter`.

---

## No hard dependency on `@iwsdk/core`

Like the three.js and Babylon.js bridges keep their renderer packages at arm's length, this package **never imports `@iwsdk/core`**. The IWSDK primitives the bridge needs - `createSystem` and the `VisibilityState.Visible` value - are passed in by the consumer (who owns IWSDK). This keeps the package tree-shakeable, version-tolerant across IWSDK `0.4.x`, and trivially mockable in unit tests.

`@iwsdk/core` is declared as an **optional peer dependency**.

---

## Quick start

```typescript
import { createServiceProfile } from "@realitycollective/service-framework";
import {
  startServiceRuntime,
  makeServiceBridgeSystem,
} from "@realitycollective/service-framework-iwsdk";
import { World, createSystem, VisibilityState } from "@iwsdk/core";

// 1. Build the service graph from a profile factory: (adapter) => ServiceProfile
const createProfile = (adapter) =>
  createServiceProfile("my-app", [/* your registrations, wired to `adapter` */]);

// 2. Stand up the manager + adapter and start it.
const { manager, adapter } = startServiceRuntime(world, createProfile);

// 3. Register the one ECS system that pumps frames and maps visibility.
world.registerSystem(
  makeServiceBridgeSystem({
    adapter,
    manager,
    world,
    createSystem,
    visibleState: VisibilityState.Visible,
  }),
);
```

Game logic ticks **only while the session is visible/focused** - in the browser / 2D preview the host app shows its own "Enter VR" gate and services stay idle until the player enters VR.

---

## Services own their state: `SnapshotService`

`SnapshotService<TConfig, TSnapshot>` is the "services own state" base - one immutable snapshot plus pub/sub. Subscribers receive the current value immediately, then every publish. It has **no IWSDK dependency**.

```typescript
import { SnapshotService, type ServiceContext, type RuntimeAdapter } from "@realitycollective/service-framework-iwsdk";

interface EnergySnapshot { readonly energy: number; }

class EnergyService extends SnapshotService<unknown, EnergySnapshot> {
  constructor(context: ServiceContext, private readonly adapter: RuntimeAdapter) {
    super(context, { energy: 1 });
  }

  override initialize(): void {
    this.adapter.onFrame(({ delta }) => {
      this.updateSnapshot({ energy: Math.max(0, this.getSnapshot().energy - delta * 0.1) });
    });
  }
}
```

The presentation layer (or another service) subscribes:

```typescript
const energy = manager.resolve(ENERGY_SERVICE_TOKEN);
const unsubscribe = energy.subscribe(({ energy }) => hud.setEnergy(energy));
```

---

## Headless testing with `MockRuntimeAdapter`

Services run against `MockRuntimeAdapter` with no IWSDK / renderer / headset. Tests drive the loop by calling `emitFrame`:

```typescript
import { MockRuntimeAdapter } from "@realitycollective/service-framework-iwsdk";

const adapter = new MockRuntimeAdapter({ immersive: true });
const service = new EnergyService(makeContext(), adapter);
service.initialize();

adapter.emitFrame(0, 1 / 72);   // one frame
expect(service.getSnapshot().energy).toBeLessThan(1);
```

No `@iwsdk/core` import appears anywhere in the test.

---

## Capabilities

`AdapterCapabilities` (`immersive`, `handTracking`, `planeDetection`, `passthrough`) is what gating services read (`adapter.getCapabilities()`) or subscribe to (`adapter.onCapabilitiesChange(cb)` - mirrors `onFrame`, so gates don't poll every frame). Refine them with `adapter.setCapabilities({ ... })`.

> **One gap still to close:** deriving capabilities from the live `XRSession` (enabled features, blend mode, hand input sources) is intentionally left to the host wiring because it needs IWSDK session internals. Until that is wired, the adapter reports `DEFAULT_CAPABILITIES` (all-false) and gating services behave conservatively. `IWSDKAdapter.getWorld()` exposes the bound world as the source for that derivation, and `onCapabilitiesChange` is the notification channel for when it lands.

---

## API surface

| Symbol | Kind | Purpose |
| --- | --- | --- |
| `RuntimeAdapter` | interface | The seam services depend on (`onFrame`, `getCapabilities`, `onCapabilitiesChange`). |
| `FrameInfo` | interface | `{ timestamp, delta }`. |
| `AdapterCapabilities` / `DEFAULT_CAPABILITIES` | interface / const | XR capability flags; all-false default. |
| `Unsubscribe` / `FrameListener` / `CapabilitiesListener` | types | Callback / handle aliases. |
| `IWSDKAdapter` | class | Production adapter; `emitFrame`, `setCapabilities`, `getWorld`. |
| `MockRuntimeAdapter` | class | Headless adapter; `emitFrame(ts?, delta?)`, `setCapabilities`. |
| `SnapshotService<C, S>` | abstract class | State-owning base (`subscribe` / `getSnapshot` / `publishSnapshot` / `updateSnapshot`). |
| `ServiceContext<C>` / `SnapshotListener<S>` | types | Activation-context alias; snapshot callback. |
| `makeServiceBridgeSystem` | factory | Returns the IWSDK `ServiceBridgeSystem` class. |
| `ServiceBridgeSystemOptions` | interface | `{ adapter, manager, world, createSystem, visibleState }`. |
| `startServiceRuntime` / `ServiceRuntime` | function / interface | Bootstraps `{ manager, adapter }` from a profile factory. |
| `IWSDKWorldLike` / `CreateSystemLike` / … | types | Structural `@iwsdk/core` contracts (no engine import). |

---

## Running tests

From the workspace root:

```bash
npm test
```

## Running the example

```bash
npx tsx packages/service-framework-iwsdk/Examples/main.ts
```

The example mocks the `@iwsdk/core` primitives so it runs in plain Node.js: it decays an `EnergyService` while the session is "visible", then shows it idling once visibility is lost.

---

## Live examples

- Weather client walkthrough: **[service-framework-weather.pages.dev](https://service-framework-weather.pages.dev)**
- Client runtime reference: **[service-framework-client-app.pages.dev](https://service-framework-client-app.pages.dev)**

## License

MIT
