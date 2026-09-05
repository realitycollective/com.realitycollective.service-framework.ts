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
     • if focused: scheduler.emit("renderTick", { source: "iwsdk", ... })
   ▼
IWSDKAdapter (RuntimeAdapter) → onFrame fan-out    → services
ServiceManager.scheduler      → renderTick channel → services
   ▼
ServiceManager  →  your SnapshotService graph
```

Each focused frame goes out twice, on the two channels a service can be written against. `adapter.onFrame` is the adapter seam, and carries IWSDK's own units: `timestamp` in milliseconds, `delta` in seconds. `renderTick` is the scheduler channel the three.js and Babylon.js bridges emit, and carries a `LifecycleContext` in scheduler units: `timestamp` and `deltaTime` both in milliseconds, a frame counter, and `source: "iwsdk"`. A service written against `renderTick` therefore runs under IWSDK exactly as it does under three.js, with no change. Frames while the session is not focused are emitted on neither channel and do not advance the counter.

**Invariant:** services depend only on `RuntimeAdapter`, never on `@iwsdk/core`. That is what keeps them unit-testable headless - swap `IWSDKAdapter` for `MockRuntimeAdapter`.

---

## No hard dependency on `@iwsdk/core`

Like the three.js and Babylon.js bridges keep their renderer packages at arm's length, this package **never imports `@iwsdk/core`**. The IWSDK primitives the bridge needs - `createSystem` and the `VisibilityState.Visible` value - are passed in by the consumer (who owns IWSDK). This keeps the package tree-shakeable, version-tolerant across IWSDK `0.4.x` and `0.5.x`, and trivially mockable in unit tests.

`@iwsdk/core` is **not declared as a dependency of any kind** - not even an optional peer. Everything this package reads off the world is structurally typed in `iwsdk-host.ts` and passed in: `createSystem`, the `VisibilityState.Visible` value, the visibility signal, and - all optional - `visibilityState.subscribe`, the live `session`, `launchXR` and `exitXR`. Because the additions are optional, a world that carries nothing but the visibility signal still type-checks and still works; it simply reports no capabilities and no session. Those contracts are identical across 0.4.x and 0.5.x. A peer range here would constrain nothing while still being able to fail a consumer's clean install, so there is deliberately no entry.

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

`SnapshotService<TConfig, TSnapshot>` is the "services own state" base - one immutable snapshot plus pub/sub. Subscribers receive the current value immediately, then every publish. It has **no IWSDK dependency**, which is why it now lives in the core package; this package re-exports it, so the older import still works.

```typescript
import { SnapshotService, type ServiceContext, type RuntimeAdapter } from "@realitycollective/service-framework";

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
import { MockRuntimeAdapter } from "@realitycollective/service-framework";

const adapter = new MockRuntimeAdapter({ immersive: true });
const service = new EnergyService(makeContext(), adapter);
service.initialize();

adapter.emitFrame(0, 1 / 72);   // one frame
expect(service.getSnapshot().energy).toBeLessThan(1);
```

No `@iwsdk/core` import appears anywhere in the test.

`MockRuntimeAdapter` implements the session facet in memory too: `simulateSessionStart()`, `simulateSessionEnd()` and `simulateVisibility(v)` drive it, and `request()` resolves `{ ok: true }` when a start is simulated before the timeout, `{ ok: false, reason: "timeout" }` otherwise. Both adapters run the same conformance suite, published from the core as `runtimeAdapterContractCases()`, so a service that behaves one way headless behaves the same way on a headset.

---

## Capabilities

`AdapterCapabilities` (`immersive`, `handTracking`, `planeDetection`, `passthrough`, `environmentBlendMode`) is what gating services read (`adapter.getCapabilities()`) or subscribe to (`adapter.onCapabilitiesChange(cb)` - mirrors `onFrame`, so gates don't poll every frame).

`IWSDKAdapter` derives all four from the live session through `deriveCapabilities(session)`, exported by `@realitycollective/service-framework`. The rules live in the core so that every host binding - this one, the three.js `WebXRRuntimeAdapter`, and whatever comes next - reports the same flags for the same session. It derives on construction, every time the world's visibility signal fires, which is when a session comes or goes, and every time the live session raises `inputsourceschange`:

| Flag | Derived from |
| --- | --- |
| `immersive` | a session exists on the world |
| `handTracking` | `"hand-tracking"` in `session.enabledFeatures`, or any `session.inputSources[i].hand` |
| `planeDetection` | `"plane-detection"` in `session.enabledFeatures` |
| `passthrough` | `session.environmentBlendMode` is present and is not `"opaque"` |
| `environmentBlendMode` | `session.environmentBlendMode` where WebXR defines the value, otherwise `null` |

`passthrough` says whether the world shows through; `environmentBlendMode` says how, which is what a service needs to decide what to draw. The two passthrough modes behave oppositely. `"alpha-blend"` is video passthrough, as on a Quest, and composites normally, so black stays black. `"additive"` is a see-through optical display and adds the rendered image to the light already reaching the eye, so black is fully transparent. A service that dims the world has to draw brighter on an additive display, not darker. A value WebXR does not define reports as `null` rather than passing a string through, so a consumer switching on the mode never meets one it has no rule for; `passthrough` still reports `true` for such a value.

With no session the adapter reports `DEFAULT_CAPABILITIES`: every flag false and the blend mode `null`, so gating services behave conservatively before the player enters XR. Subscribers are notified only when a flag actually changes, so a signal that fires every visibility blip does not wake every gate.

Input sources are followed without a nudge. The adapter attaches an `inputsourceschange` listener to the live session and detaches it when the session goes, so `handTracking` updates when the player picks the controllers up or puts them down. IWSDK's world carries a real `XRSession`, which raises the event; both listener methods are optional on `IWSDKSessionLike` and the adapter guards for their absence, so a world faked in a test still works and simply never pushes.

One host still needs a nudge. If the world's `visibilityState` has no `subscribe`, nothing tells the adapter that a session came or went: call `adapter.refreshCapabilities()` after the host changes something. Call it too if the host enables a feature mid-session without a visibility transition.

### Overrides

`adapter.setCapabilities({ ... })` still exists, and is now a layer on top of the derived values rather than the only source of them. An override wins for as long as it is set: it survives every later derivation, so forcing `passthrough: true` on a device that under-reports its blend mode keeps working when the session changes. Overrides are dropped by `adapter.clearCapabilityOverrides()`, which falls back to the derived values, or by `adapter.dispose()`.

`adapter.dispose()` releases the visibility subscription, settles any in-flight session request, drops the overrides and clears every listener. Call it when tearing the world down.

---

## Sessions

`adapter.session` is the optional session facet from `RuntimeAdapter`, implemented here over the world's `launchXR` and `exitXR`. It exists so a client can start, end and observe an XR session without reaching past the adapter into IWSDK - which is what a client had to do before, and the reason the "the adapter does not abstract sessions" position was reversed.

```typescript
const result = await adapter.session.request("immersive-vr", { timeoutMs: 8000 });

if (!result.ok) {
  // "unsupported" | "denied" | "timeout" | "error" - a normal runtime outcome,
  // so it comes back as a result rather than a thrown error.
  showEnterVrError(result.reason);
}

const stop = adapter.session.onStateChange((state) => hud.setSessionState(state));
adapter.session.onVisibilityChange((visibility) => hud.setDimmed(visibility !== "visible"));

await adapter.session.end();
```

- `getState()` walks `"none"` → `"requesting"` → `"active"` → `"ending"` → `"none"`.
- `request(mode, options)` calls `launchXR` with `{ sessionMode: mode }` (the `XROptions` shape IWSDK accepts; its `SessionMode` enum values are the WebXR mode strings), plus a `features` object when the request named any, and resolves once a session appears, whether the adapter learns that from the visibility signal or from its polling fallback. A synchronous throw from `launchXR` comes back as `{ ok: false, reason: "unsupported", error }`. Nothing appearing within `timeoutMs` (default 10000) comes back as `{ ok: false, reason: "timeout" }`.
- `end()` calls `exitXR` and resolves once the session is gone.
- `onVisibilityChange` maps IWSDK's signal onto `"visible"`, `"visible-blurred"`, `"hidden"` and `"non-immersive"`. A value the adapter does not recognise is reported as `"hidden"`, because treating an unknown state as visible would keep game logic running when it should not.

A world with no `launchXR` reports `{ ok: false, reason: "unsupported" }` rather than throwing, so a 2D preview build needs no special case.

### Per-request features

`SessionRequestOptions` carries `requiredFeatures` and `optionalFeatures` as WebXR feature strings, the same on every host binding. An app that swaps from `"immersive-vr"` to `"immersive-ar"` mid-session needs them: without them the second session gets whatever defaults the host was built with, which were chosen for the first.

```typescript
await adapter.session.request("immersive-ar", {
  requiredFeatures: ["hand-tracking"],
  optionalFeatures: ["plane-detection"],
});
```

IWSDK does not take feature strings. Its `launchXR` takes an `XROptions` whose `features` is a structured object, so the adapter translates. A required feature becomes `{ required: true }`, an optional one becomes `true`, and a feature named in both lists comes out required.

| WebXR feature string | IWSDK `XRFeatureOptions` key |
| --- | --- |
| `hand-tracking` | `handTracking` |
| `anchors` | `anchors` |
| `hit-test` | `hitTest` |
| `plane-detection` | `planeDetection` |
| `mesh-detection` | `meshDetection` |
| `depth-sensing` | `depthSensing` |
| `layers` | `layers` |
| `unbounded` | `unbounded` |

Anything else has nowhere to go. `local-floor` and `bounded-floor` are reference spaces, which IWSDK configures through `XROptions.referenceSpace` rather than as features; `dom-overlay` it does not model at all. Such a string is dropped from the request rather than thrown, because the session is still one the host can serve and failing it over a feature the app may not need would be worse. Nothing is logged.

To see what would be dropped before you ask, call the mapping yourself:

```typescript
import { toIWSDKFeatures } from "@realitycollective/service-framework-iwsdk";

const { features, unmapped } = toIWSDKFeatures({ requiredFeatures: ["hand-tracking", "dom-overlay"] });
// features -> { handTracking: { required: true } }
// unmapped -> ["dom-overlay"]
```

`launchXR` merges what it is given over the world's `xrDefaults`, so a request that names no features leaves the app's defaults exactly as they were, and one that names some adds to them.

---

## API surface

Owned by this package:

| Symbol | Kind | Purpose |
| --- | --- | --- |
| `IWSDKAdapter` | class | Production adapter; `emitFrame`, `refreshCapabilities`, `setCapabilities`, `clearCapabilityOverrides`, `session`, `getWorld`, `dispose`. |
| `makeServiceBridgeSystem` | factory | Returns the IWSDK `ServiceBridgeSystem` class; pumps `onFrame` and `renderTick`. |
| `ServiceBridgeSystemOptions` | interface | `{ adapter, manager, world, createSystem, visibleState }`. |
| `startServiceRuntime` / `ServiceRuntime` | function / interface | Bootstraps `{ manager, adapter }` from a profile factory. |
| `toIWSDKFeatures` / `IWSDK_FEATURE_KEYS` / `IWSDKFeatureMapping` | function / const / interface | Maps WebXR feature strings onto IWSDK's structured flags and reports what it could not map. |
| `IWSDKWorldLike` / `IWSDKSignalLike` / `IWSDKSessionLike` / `IWSDKInputSourceLike` / `IWSDKSessionEventType` / `IWSDKSessionEventListener` / `IWSDKXROptionsLike` / `IWSDKXRFeatureOptionsLike` / `IWSDKFeatureFlagLike` / `IWSDKDepthSensingFlagLike` / `IWSDKSystemLike` / `IWSDKSystemConstructor` / `CreateSystemLike` | types | Structural `@iwsdk/core` contracts (no engine import). |

Re-exported from `@realitycollective/service-framework`. None of these ever touched IWSDK, and every host binding needs them, so they moved into the core in 1.0.1. They are re-exported here unchanged, so importing them from this package keeps working; new code should import them from the core package.

| Symbol | Kind | Purpose |
| --- | --- | --- |
| `RuntimeAdapter` | interface | The seam services depend on (`onFrame`, `getCapabilities`, `onCapabilitiesChange`, optional `session`). |
| `FrameInfo` | interface | `{ timestamp, delta }`. |
| `AdapterCapabilities` / `DEFAULT_CAPABILITIES` | interface / const | XR capability flags; all-false default. |
| `Unsubscribe` / `FrameListener` / `CapabilitiesListener` | types | Callback / handle aliases. |
| `SessionFacet` | interface | `getState`, `request`, `end`, `onStateChange`, `onVisibilityChange`. |
| `SessionMode` / `SessionState` / `SessionResult` / `SessionFailureReason` / `SessionVisibility` / `SessionRequestOptions` | types | The session facet's vocabulary. |
| `DEFAULT_SESSION_TIMEOUT_MS` | const | 10000 - the default `request` timeout. |
| `RUNTIME_ADAPTER_FACETS` / `RuntimeAdapterFacet` | const / type | Every optional facet an adapter can carry; walked by the conformance suite. |
| `MockRuntimeAdapter` | class | Headless adapter; `emitFrame(ts?, delta?)`, `setCapabilities`, `simulateSessionStart`, `simulateSessionEnd`, `simulateVisibility`. |
| `SnapshotService<C, S>` | abstract class | State-owning base (`subscribe` / `getSnapshot` / `publishSnapshot` / `updateSnapshot`). |
| `ServiceContext<C>` / `SnapshotListener<S>` | types | Activation-context alias; snapshot callback. |

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
